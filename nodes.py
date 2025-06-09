# Standard Library
import os
import json
import uuid
import base64
import wave
import ctypes
from ctypes import c_float, c_int, POINTER, Structure

# Third-Party Libraries
import numpy as np
import torch
import torch.nn.functional as F
import torchaudio
import torchaudio.transforms as T
import torchaudio.functional as tfaudio
import soundfile as sf

# Project-Specific / Local Modules
import comfy.sample as comfy_sample
import comfy.model_management as model_management
import folder_paths
import nodes
from comfy.utils import ProgressBar

# Import our library manager
from .libeffects import get_library_manager

class SoundFlow_FadeNode:
    def __init__(self):
        pass

    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "audio": ("AUDIO",),
                "fade_in_seconds": ("FLOAT", {"default": 0.0, "min": 0.0, "max": 30.0, "step": 0.1, "label": "Fade In (seconds)"}),
                "fade_out_seconds": ("FLOAT", {"default": 0.0, "min": 0.0, "max": 30.0, "step": 0.1, "label": "Fade Out (seconds)"}),
            },
        }

    RETURN_TYPES = ("AUDIO",)
    RETURN_NAMES = ("faded_audio",)
    FUNCTION = "apply_fade"
    CATEGORY = "audio"

    def _get_samples_from_seconds(self, seconds, sample_rate):
        """Convert seconds to number of samples."""
        return int(seconds * sample_rate)

    def _apply_fade(self, waveform, fade_in_samples, fade_out_samples, sample_rate):
        """Apply fade in and fade out to the waveform with automatic adjustment for short audio."""
        if fade_in_samples == 0 and fade_out_samples == 0:
            return waveform
        
        audio_length = waveform.shape[-1]
        
        # Automatically adjust fade lengths if audio is too short
        if fade_in_samples + fade_out_samples >= audio_length:
            # Ensure at least 10% of audio remains unfaded, or minimum 1 sample
            max_total_fade = max(1, int(audio_length * 0.9))
            
            if fade_in_samples > 0 and fade_out_samples > 0:
                # Proportionally reduce both fades
                total_requested = fade_in_samples + fade_out_samples
                fade_in_samples = int((fade_in_samples / total_requested) * max_total_fade)
                fade_out_samples = int((fade_out_samples / total_requested) * max_total_fade)
            elif fade_in_samples > 0:
                fade_in_samples = min(fade_in_samples, max_total_fade)
            elif fade_out_samples > 0:
                fade_out_samples = min(fade_out_samples, max_total_fade)
        
        # Apply fades with adjusted lengths
        if fade_in_samples > 0:
            fade_in = torch.cos(torch.linspace(np.pi, 2*np.pi, fade_in_samples)) * 0.5 + 0.5
            fade_in = fade_in.to(waveform.device)
            waveform[..., :fade_in_samples] *= fade_in

        if fade_out_samples > 0:
            fade_out = torch.cos(torch.linspace(0, np.pi, fade_out_samples)) * 0.5 + 0.5
            fade_out = fade_out.to(waveform.device)
            waveform[..., -fade_out_samples:] *= fade_out

        return waveform

    def apply_fade(self, audio, fade_in_seconds, fade_out_seconds):
        """
        Applies fade-in and fade-out effects on the input audio.
        """
        if 'waveform' not in audio:
            raise ValueError("Audio input must contain 'waveform' key")

        waveform = audio['waveform'].clone()
        sample_rate = audio.get('sample_rate', 44100)

        # Handle 3D tensors (batch, channels, samples)
        if waveform.ndim != 3:
            raise ValueError(f"Expected 3D tensor, got shape {waveform.shape}")

        # Convert fade times to samples
        fade_in_samples = self._get_samples_from_seconds(fade_in_seconds, sample_rate)
        fade_out_samples = self._get_samples_from_seconds(fade_out_seconds, sample_rate)

        # Apply fades
        faded_waveform = self._apply_fade(waveform, fade_in_samples, fade_out_samples, sample_rate)

        return ({"waveform": faded_waveform, "sample_rate": sample_rate},)
    
class SoundFlow_MixerNode:
    def __init__(self):
        pass

    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "audio1": ("AUDIO",),
                "audio2": ("AUDIO",),
                "mix_value": ("FLOAT", {"default": 0.5, "min": 0.0, "max": 1.0, "step": 0.01, "label": "Mix Ratio (Audio2)"}),
            },
        }

    RETURN_TYPES = ("AUDIO",)
    RETURN_NAMES = ("mixed_audio",)
    FUNCTION = "mix_audio"
    CATEGORY = "audio"

    def _resample_audio(self, waveform, sample_rate_from, sample_rate_to):
        """Resample audio to match the target sample rate."""
        if sample_rate_from != sample_rate_to:
            resampler = T.Resample(sample_rate_from, sample_rate_to)
            waveform = resampler(waveform)
        return waveform

    def _match_audio_length(self, waveform1, waveform2):
        """Ensure both audio waveforms have the same length by padding or trimming."""
        length1 = waveform1.shape[-1]
        length2 = waveform2.shape[-1]
        
        if length1 > length2:
            # Pad waveform2 to match length of waveform1
            waveform2 = torch.nn.functional.pad(waveform2, (0, length1 - length2))
        elif length2 > length1:
            # Pad waveform1 to match length of waveform2
            waveform1 = torch.nn.functional.pad(waveform1, (0, length2 - length1))
        
        return waveform1, waveform2

    def mix_audio(self, audio1, audio2, mix_value):
        """
        Mixes two audio tracks with the given mix ratio.
        """
        # Extract waveforms and sample rates
        if 'waveform' in audio1 and 'waveform' in audio2:
            waveform1 = audio1['waveform']
            waveform2 = audio2['waveform']
            sample_rate1 = audio1.get('sample_rate', 44100)
            sample_rate2 = audio2.get('sample_rate', 44100)
        else:
            raise ValueError("Both audio inputs must contain 'waveform' key")

        # Handle 3D tensors (batch, channels, samples)
        if waveform1.ndim != 3 or waveform2.ndim != 3:
            raise ValueError(f"Expected 3D tensors, got shapes {waveform1.shape} and {waveform2.shape}")

        # Resample if different sample rates
        waveform2 = self._resample_audio(waveform2, sample_rate2, sample_rate1)

        # Match the length of the two audio tracks
        waveform1, waveform2 = self._match_audio_length(waveform1, waveform2)

        # Handle different channel counts
        if waveform1.shape[1] != waveform2.shape[1]:
            print(f"Adjusting channel count. Audio1: {waveform1.shape[1]} channels, Audio2: {waveform2.shape[1]} channels")
            if waveform1.shape[1] > waveform2.shape[1]:
                # Duplicate mono to match stereo
                waveform2 = waveform2.repeat(1, waveform1.shape[1], 1)
            else:
                # Take first n channels to match fewer channels
                waveform1 = waveform1[:, :waveform2.shape[1], :]

        # Mix the audio
        mix_value = torch.clamp(torch.tensor(mix_value), 0.0, 1.0).item()
        mixed_waveform = (1.0 - mix_value) * waveform1 + mix_value * waveform2

        # Normalize to prevent clipping
        max_val = torch.max(torch.abs(mixed_waveform))
        if max_val > 1.0:
            mixed_waveform = mixed_waveform / max_val

        return ({"waveform": mixed_waveform, "sample_rate": sample_rate1},)

class SoundFlow_SilenceTrimmerNode:
    def __init__(self):
        pass

    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "audio": ("AUDIO",),
                "threshold_db": ("FLOAT", {
                    "default": -60.0,
                    "min": -120.0,
                    "max": 0.0,
                    "step": 1.0,
                    "label": "Threshold (dB)"
                }),
                "min_silence_duration": ("FLOAT", {
                    "default": 0.1,
                    "min": 0.01,
                    "max": 10.0,
                    "step": 0.01,
                    "label": "Minimum Silence Duration (seconds)"
                }),
                "keep_silence": ("FLOAT", {
                    "default": 0.1,
                    "min": 0.0,
                    "max": 1.0,
                    "step": 0.01,
                    "label": "Keep Silence Duration (seconds)"
                }),
                "fade_duration": ("FLOAT", {
                    "default": 0.01,
                    "min": 0.001,
                    "max": 0.5,
                    "step": 0.001,
                    "label": "Crossfade Duration (seconds)"
                })
            },
        }

    RETURN_TYPES = ("AUDIO",)
    RETURN_NAMES = ("trimmed_audio",)
    FUNCTION = "trim_silence"
    CATEGORY = "audio"

    def _amplitude_to_db(self, amplitude):
        """Convert amplitude to decibels"""
        return 20 * torch.log10(torch.clamp(amplitude, min=1e-10))

    def _apply_crossfade(self, segment1, segment2, fade_samples):
        """Apply crossfade between two segments"""
        if fade_samples == 0:
            return torch.cat([segment1, segment2], dim=-1)

        # Ensure we have enough samples for the crossfade
        fade_samples = min(segment1.shape[-1], segment2.shape[-1], fade_samples)
        if fade_samples == 0:
            return torch.cat([segment1, segment2], dim=-1)

        fade_in = torch.linspace(0, 1, fade_samples, device=segment1.device)
        fade_out = torch.linspace(1, 0, fade_samples, device=segment1.device)

        # Apply the crossfade
        fade_out = fade_out.view(1, 1, -1)
        fade_in = fade_in.view(1, 1, -1)

        # Get the overlapping parts
        end_segment = segment1[..., -fade_samples:]
        start_segment = segment2[..., :fade_samples]

        # Create the crossfaded region
        crossfaded = end_segment * fade_out + start_segment * fade_in

        # Combine everything
        return torch.cat([
            segment1[..., :-fade_samples],
            crossfaded,
            segment2[..., fade_samples:]
        ], dim=-1)

    def _get_energy_profile(self, waveform, window_size, hop_length):
        """Calculate the energy profile of the audio using overlapping windows"""
        # Convert to mono if stereo
        if waveform.shape[1] > 1:
            mono_waveform = torch.mean(waveform, dim=1)
        else:
            mono_waveform = waveform.squeeze(1)

        num_windows = (mono_waveform.shape[1] - window_size) // hop_length + 1
        energy = torch.zeros(num_windows, device=waveform.device)

        for i in range(num_windows):
            start = i * hop_length
            end = start + window_size
            window = mono_waveform[0, start:end]
            energy[i] = torch.sqrt(torch.mean(window ** 2))

        return energy

    def _merge_close_regions(self, regions, min_gap_samples):
        """Merge regions that are closer than min_gap_samples"""
        if not regions:
            return regions

        merged = []
        current_start, current_end = regions[0]

        for start, end in regions[1:]:
            if start - current_end <= min_gap_samples:
                current_end = max(current_end, end)
            else:
                merged.append((current_start, current_end))
                current_start, current_end = start, end

        merged.append((current_start, current_end))
        return merged

    def _find_non_silent_regions(self, waveform, threshold_db, min_silence_samples, sample_rate):
        """Find regions of non-silence in the audio using overlapping windows"""
        window_duration = 0.02  # 20ms window
        hop_duration = 0.01     # 10ms hop (50% overlap)
        window_size = int(window_duration * sample_rate)
        hop_length = int(hop_duration * sample_rate)

        # Get energy profile with overlapping windows
        energy = self._get_energy_profile(waveform, window_size, hop_length)

        # Convert to dB
        db = self._amplitude_to_db(energy)

        # Find non-silent regions
        is_sound = db > threshold_db

        # Convert windows to sample positions
        regions = []
        in_sound = False
        current_start = 0

        for i, is_active in enumerate(is_sound):
            sample_pos = i * hop_length # Position of the *start* of the window

            if is_active and not in_sound:
                current_start = sample_pos
                in_sound = True
            elif not is_active and in_sound:
                # End of sound detected
                end_sample_pos = sample_pos # End of the silent window, so sound ended before this window
                if end_sample_pos - current_start >= min_silence_samples:
                    regions.append((current_start, end_sample_pos)) # Region is from start to the beginning of silence window
                in_sound = False

        # Handle the last region if still in sound at the end
        if in_sound:
            regions.append((current_start, waveform.shape[-1]))

        # Merge regions that are close together
        regions = self._merge_close_regions(regions, min_silence_samples)

        return regions

    def trim_silence(self, audio, threshold_db=-60.0, min_silence_duration=0.1, keep_silence=0.1, fade_duration=0.01):
        """
        Remove silence from audio, keeping a specified duration of silence between sound segments.
        """
        waveform = audio['waveform'].clone()
        sample_rate = audio['sample_rate']

        # Convert durations to samples
        min_silence_samples = int(min_silence_duration * sample_rate)
        keep_silence_samples = int(keep_silence * sample_rate)
        fade_samples = int(fade_duration * sample_rate)

        # Find non-silent regions
        regions = self._find_non_silent_regions(waveform, threshold_db, min_silence_samples, sample_rate)

        if not regions:
            print("No non-silent regions found")
            return (audio,)

        # Process regions to construct trimmed audio
        result = None
        total_silence_removed = 0
        last_region_end = 0 # Track the end of the previously processed *non-silent* region

        for i, (start, end) in enumerate(regions):
            segment = waveform[:, :, start:end] # Extract the non-silent segment *without* keep_silence expansion

            if result is None:
                # First segment, just take it with 'keep_silence' padding at the beginning if possible.
                start_padding = max(0, start - keep_silence_samples)
                result = waveform[:, :, start_padding:end]
            else:
                # For subsequent segments, handle the silence gap and keep_silence
                gap_start = last_region_end # Start of the silence gap
                gap_end = start          # End of the silence gap (start of current sound region)
                gap_duration = gap_end - gap_start

                silence_to_keep_samples = min(gap_duration, keep_silence_samples) # Keep at most gap duration or keep_silence
                kept_silence_start = gap_end - silence_to_keep_samples
                kept_silence_segment = waveform[:, :, kept_silence_start:gap_end] if silence_to_keep_samples > 0 else torch.empty((waveform.shape[0], waveform.shape[1], 0), device=waveform.device)


                # Concatenate with crossfade (if fade_duration > 0)
                if fade_samples > 0 and result.shape[-1] > 0 and kept_silence_segment.shape[-1] > 0:
                    result = self._apply_crossfade(result, kept_silence_segment, fade_samples)
                else:
                    result = torch.cat([result, kept_silence_segment], dim=-1)

                if fade_samples > 0 and result.shape[-1] > 0 and segment.shape[-1] > 0:
                    result = self._apply_crossfade(result, segment, fade_samples)
                else:
                    result = torch.cat([result, segment], dim=-1)


                silence_removed_in_gap = gap_duration - silence_to_keep_samples
                total_silence_removed += max(0, silence_removed_in_gap) # Accumulate silence removed from gaps

            last_region_end = end # Update to the *end* of the current *non-silent* region (important!)


        if result is None:
            return (audio,)

        print(f"Removed {total_silence_removed/sample_rate:.2f}s of silence "
              f"({(total_silence_removed/waveform.shape[-1])*100:.1f}% of original duration)")

        return ({"waveform": result, "sample_rate": sample_rate},)

class SoundFlow_ConcatenatorNode:
    def __init__(self):
        pass
        
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "audio1": ("AUDIO",),
                "audio2": ("AUDIO",),
                "silence_before": ("FLOAT", {
                    "default": 0.0,
                    "min": 0.0,
                    "max": 30.0,
                    "step": 0.1,
                    "label": "Silence Before (seconds)"
                }),
                "silence_between": ("FLOAT", {
                    "default": 0.0,
                    "min": 0.0,
                    "max": 30.0,
                    "step": 0.1,
                    "label": "Silence Between (seconds)"
                }),
                "silence_after": ("FLOAT", {
                    "default": 0.0,
                    "min": 0.0,
                    "max": 30.0,
                    "step": 0.1,
                    "label": "Silence After (seconds)"
                }),
                "fade_duration": ("FLOAT", {
                    "default": 0.01,
                    "min": 0.0,
                    "max": 1.0,
                    "step": 0.001,
                    "label": "Crossfade Duration (seconds)"
                })
            },
        }

    RETURN_TYPES = ("AUDIO",)
    RETURN_NAMES = ("concatenated_audio",)
    FUNCTION = "concatenate_audio"
    CATEGORY = "audio"

    def _create_silence(self, channels, sample_rate, duration_seconds, device):
        """Create a silent audio segment"""
        num_samples = int(duration_seconds * sample_rate)
        return torch.zeros((1, channels, num_samples), device=device)

    def _apply_crossfade(self, segment1, segment2, fade_samples):
        """Apply crossfade between two segments"""
        if fade_samples == 0:
            return torch.cat([segment1, segment2], dim=-1)
            
        # Ensure we have enough samples for the crossfade
        if segment1.shape[-1] < fade_samples or segment2.shape[-1] < fade_samples:
            fade_samples = min(segment1.shape[-1], segment2.shape[-1])
            if fade_samples == 0:
                return torch.cat([segment1, segment2], dim=-1)

        # Create fade curves
        fade_in = torch.linspace(0, 1, fade_samples, device=segment1.device)
        fade_out = torch.linspace(1, 0, fade_samples, device=segment1.device)

        # Reshape for broadcasting
        fade_out = fade_out.view(1, 1, -1)
        fade_in = fade_in.view(1, 1, -1)

        # Apply crossfade
        end_segment = segment1[..., -fade_samples:]
        start_segment = segment2[..., :fade_samples]
        crossfaded = end_segment * fade_out + start_segment * fade_in

        # Combine all segments
        return torch.cat([
            segment1[..., :-fade_samples],
            crossfaded,
            segment2[..., fade_samples:]
        ], dim=-1)

    def concatenate_audio(self, audio1, audio2, silence_before=0.0, silence_between=0.0, 
                         silence_after=0.0, fade_duration=0.01):
        """
        Concatenate two audio segments with optional silence and crossfading.
        
        Args:
            audio1 (dict): First audio dictionary containing waveform and sample_rate
            audio2 (dict): Second audio dictionary containing waveform and sample_rate
            silence_before (float): Duration of silence to add before first audio in seconds
            silence_between (float): Duration of silence to add between audios in seconds
            silence_after (float): Duration of silence to add after second audio in seconds
            fade_duration (float): Duration of crossfade between segments in seconds
        """
        # Extract waveforms and sample rates
        waveform1 = audio1['waveform']
        waveform2 = audio2['waveform']
        sample_rate1 = audio1.get('sample_rate', 44100)
        sample_rate2 = audio2.get('sample_rate', 44100)

        # Resample if different sample rates
        if sample_rate1 != sample_rate2:
            print(f"Resampling audio2 from {sample_rate2}Hz to {sample_rate1}Hz")
            resampler = T.Resample(sample_rate2, sample_rate1)
            waveform2 = resampler(waveform2.squeeze(0)).unsqueeze(0)

        # Handle different channel counts
        if waveform1.shape[1] != waveform2.shape[1]:
            print(f"Adjusting channel count. Audio1: {waveform1.shape[1]} channels, Audio2: {waveform2.shape[1]} channels")
            if waveform1.shape[1] > waveform2.shape[1]:
                waveform2 = waveform2.repeat(1, waveform1.shape[1], 1)
            else:
                waveform1 = waveform1[:, :waveform2.shape[1], :]

        # Calculate fade samples
        fade_samples = int(fade_duration * sample_rate1)

        # Create silence segments
        channels = waveform1.shape[1]
        device = waveform1.device
        
        silence_before_segment = self._create_silence(channels, sample_rate1, silence_before, device)
        silence_between_segment = self._create_silence(channels, sample_rate1, silence_between, device)
        silence_after_segment = self._create_silence(channels, sample_rate1, silence_after, device)

        # Concatenate segments with silence and crossfading
        result = waveform1
        
        # Add silence before if needed
        if silence_before > 0:
            result = self._apply_crossfade(silence_before_segment, result, fade_samples)
            
        # Add silence between and second audio
        if silence_between > 0:
            result = self._apply_crossfade(result, silence_between_segment, fade_samples)
            result = self._apply_crossfade(result, waveform2, fade_samples)
        else:
            result = self._apply_crossfade(result, waveform2, fade_samples)
            
        # Add silence after if needed
        if silence_after > 0:
            result = self._apply_crossfade(result, silence_after_segment, fade_samples)

        print(f"Final audio duration: {result.shape[-1]/sample_rate1:.2f}s")
        
        return ({"waveform": result, "sample_rate": sample_rate1},)
    
class SoundFlow_SetLengthNode:
    def __init__(self):
        pass

    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "audio": ("AUDIO",),
                "length": ("FLOAT", {"default": 10.0, "min": 0.1, "max": 3600.0, "step": 0.1, "label": "Target Length (seconds)"}),
            },
        }

    RETURN_TYPES = ("AUDIO",)
    RETURN_NAMES = ("audio",)
    FUNCTION = "set_audio_length"
    CATEGORY = "audio"

    def _get_samples_from_seconds(self, seconds, sample_rate):
        """Convert seconds to number of samples."""
        return int(seconds * sample_rate)

    def set_audio_length(self, audio, length):
        """
        Set the length of the audio to the specified target length (in seconds).
        If the audio is shorter, it will be padded with zeros; if it's longer, it will be trimmed.
        """
        if 'waveform' not in audio:
            raise ValueError("Audio input must contain 'waveform' key")

        waveform = audio['waveform'].clone()
        sample_rate = audio.get('sample_rate', 44100)

        # Handle 3D tensors (batch, channels, samples)
        if waveform.ndim != 3:
            raise ValueError(f"Expected 3D tensor, got shape {waveform.shape}")

        # Convert target length to samples
        target_samples = self._get_samples_from_seconds(length, sample_rate)

        # Get current length of the waveform in samples
        current_samples = waveform.shape[2]

        # Trim or pad the waveform based on the target length
        if current_samples > target_samples:
            # Trim audio
            trimmed_waveform = waveform[:, :, :target_samples]
        elif current_samples < target_samples:
            # Pad audio with zeros
            padding = target_samples - current_samples
            trimmed_waveform = torch.nn.functional.pad(waveform, (0, padding), "constant", 0)
        else:
            # Audio is already the target length
            trimmed_waveform = waveform

        return ({"waveform": trimmed_waveform, "sample_rate": sample_rate},)
    
class SoundFlow_GetLengthNode:
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {"audio": ("AUDIO",)}}  # Changed from "AUDIOPATH" to "AUDIO"

    CATEGORY = "AIFSH_XTTS"
    DESCRIPTION = "Outputs the length of the audio file in seconds."
    RETURN_TYPES = ("FLOAT",)
    FUNCTION = "get_audio_length"

    def get_audio_length(self, audio):
        if isinstance(audio, dict) and "waveform" in audio and "sample_rate" in audio:
            # If the input is a tensor dictionary
            waveform = audio["waveform"]
            sample_rate = audio["sample_rate"]
            length_seconds = waveform.shape[-1] / sample_rate
        elif isinstance(audio, str) and os.path.isfile(audio):
            try:
                # If the input is a file path, use torchaudio
                waveform, sample_rate = torchaudio.load(audio)
                length_seconds = waveform.shape[1] / sample_rate
            except Exception:
                # Fallback to wave module (only for WAV files)
                with wave.open(audio, "rb") as wav_file:
                    frames = wav_file.getnframes()
                    rate = wav_file.getframerate()
                    length_seconds = frames / float(rate)
        else:
            raise ValueError("Invalid audio input. Expected a file path or an audio dictionary.")

        return (length_seconds,)

import torch

class SoundFlow_TrimAudioNode:
    def __init__(self):
        pass

    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "audio": ("AUDIO",),
                "start": ("FLOAT", {"default": 0.0, "min": -1.0, "max": 3600.0, "step": 0.1, "label": "Start Time (seconds)"}),
                "end": ("FLOAT", {"default": -1.0, "min": -1.0, "max": 3600.0, "step": 0.1, "label": "End Time (seconds)"}),
            },
        }

    RETURN_TYPES = ("AUDIO",)
    RETURN_NAMES = ("audio",)
    FUNCTION = "trim_audio"
    CATEGORY = "audio"

    def _get_samples_from_seconds(self, seconds, sample_rate):
        """Convert seconds to number of samples."""
        return int(seconds * sample_rate)

    def trim_audio(self, audio, start, end):
        """
        Trim the audio from start to end time (in seconds).
        If end is -1, go to the full length.
        """
        if 'waveform' not in audio:
            raise ValueError("Audio input must contain 'waveform' key")

        waveform = audio['waveform'].clone()
        sample_rate = audio.get('sample_rate', 44100)

        if waveform.ndim != 3:
            raise ValueError(f"Expected 3D tensor, got shape {waveform.shape}")

        total_samples = waveform.shape[2]

        # Convert start/end to samples, applying defaults
        start_samples = self._get_samples_from_seconds(start, sample_rate)
        end_samples = total_samples if end <= 0 else self._get_samples_from_seconds(end, sample_rate)

        # Clamp values to valid range
        start_samples = max(0, min(start_samples, total_samples))
        end_samples = max(start_samples, min(end_samples, total_samples))

        trimmed_waveform = waveform[:, :, start_samples:end_samples]

        return ({"waveform": trimmed_waveform, "sample_rate": sample_rate},)


class SoundFlow_SimpleCompressorNode:
    """
    A simple audio compressor node for ComfyUI.
    It processes audio using a shared library.
    """
    def __init__(self):
        self.lib_manager = get_library_manager()
    
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "audio": ("AUDIO",),
                "threshold_db": ("FLOAT", {"default": -20.0, "min": -60.0, "max": 0.0, "step": 0.1}),
                "ratio": ("FLOAT", {"default": 4.0, "min": 1.0, "max": 20.0, "step": 0.1}),
                "attack_ms": ("FLOAT", {"default": 10.0, "min": 0.1, "max": 500.0, "step": 0.1}), # Min 0.1ms
                "release_ms": ("FLOAT", {"default": 100.0, "min": 1.0, "max": 5000.0, "step": 1.0}), # Min 1.0ms
                "knee_db": ("FLOAT", {"default": 0.0, "min": 0.0, "max": 24.0, "step": 0.1}), # Soft knee width; 0 for hard knee
                "makeup_gain_db": ("FLOAT", {"default": 0.0, "min": -24.0, "max": 24.0, "step": 0.1}),
                "mix": ("FLOAT", {"default": 1.0, "min": 0.0, "max": 1.0, "step": 0.01}), # Dry/Wet mix
            }
        }
    
    RETURN_TYPES = ("AUDIO",)
    FUNCTION = "apply_compression"
    CATEGORY = "audio/effects"
    
    def apply_compression(self, audio, threshold_db, ratio, attack_ms, release_ms, knee_db, makeup_gain_db, mix):
        if not self.lib_manager.loaded:
            print("SimpleCompressor: Library not loaded. Returning original audio.")
            return (audio,) 
        
        waveform_tensor = audio['waveform'].clone()  # Work on a copy
        sample_rate = audio['sample_rate']
        
        print(f"SimpleCompressor: Input audio shape: {waveform_tensor.shape}, Sample Rate: {sample_rate}")
        print(f"Params: Thresh:{threshold_db:.1f}dB, Ratio:{ratio:.1f}:1, Att:{attack_ms:.1f}ms, "
              f"Rel:{release_ms:.1f}ms, Knee:{knee_db:.1f}dB, Makeup:{makeup_gain_db:.1f}dB, Mix:{mix:.2f}")

        # Process each batch and channel
        # ComfyUI audio format is [batch_size, num_channels, num_samples]
        for b in range(waveform_tensor.shape[0]):
            for c in range(waveform_tensor.shape[1]):
                # Extract channel data, ensure it's float32 and CPU-bound for CFFI
                channel_data_np = waveform_tensor[b, c].detach().cpu().numpy().astype(np.float32)
                
                # The shared library function expects a C-contiguous array
                if not channel_data_np.flags['C_CONTIGUOUS']:
                    channel_data_np = np.ascontiguousarray(channel_data_np)
                
                data_ptr = channel_data_np.ctypes.data_as(ctypes.POINTER(c_float))
                num_samples = len(channel_data_np)

                if num_samples == 0:
                    print(f"SimpleCompressor: Skipping empty channel {b}-{c}")
                    continue
                
                # Call the library function (modifies channel_data_np in-place)
                with model_management.interrupt_processing_mutex:  # Ensure thread safety for ComfyUI
                    self.lib_manager.process_compressor(
                        data_ptr,
                        num_samples,
                        sample_rate,
                        threshold_db,
                        ratio,
                        attack_ms,
                        release_ms,
                        knee_db,
                        makeup_gain_db,
                        mix
                    )
                
                # Update the PyTorch tensor with the processed data (modified in-place)
                waveform_tensor[b, c] = torch.from_numpy(channel_data_np).to(waveform_tensor.device)

        processed_audio = {"waveform": waveform_tensor, "sample_rate": sample_rate}
        return (processed_audio,)
        
class SoundFlow_DuckCompressorNode:
    """
    An enhanced ducking compressor node for audio processing in ComfyUI.
    It lowers the volume of main audio (music) when the sidechain input (voice) 
    exceeds a threshold. 
    
    This version handles resampling and length matching in the shared library,
    adds gain controls for both audio streams, and implements proper fade-out
    to avoid sudden release.
    """
    def __init__(self):
        self.lib_manager = get_library_manager()
    
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "main_audio": ("AUDIO",),        # The audio to be ducked (typically music)
                "sidechain_audio": ("AUDIO",),   # The audio causing the ducking (typically voice)
                "main_gain_db": ("FLOAT", {"default": 0.0, "min": -60.0, "max": 12.0, "step": 0.1}),
                "sidechain_gain_db": ("FLOAT", {"default": 0.0, "min": -60.0, "max": 12.0, "step": 0.1}),
                "threshold_db": ("FLOAT", {"default": -24.0, "min": -60.0, "max": 0.0, "step": 0.1}),
                "reduction_db": ("FLOAT", {"default": -12.0, "min": -60.0, "max": 0.0, "step": 0.1}),
                "attack_ms": ("FLOAT", {"default": 5.0, "min": 0.1, "max": 500.0, "step": 0.1}),
                "release_ms": ("FLOAT", {"default": 200.0, "min": 1.0, "max": 5000.0, "step": 1.0}),
            }
        }
    
    RETURN_TYPES = ("AUDIO",)
    FUNCTION = "apply_ducking"
    CATEGORY = "audio/effects"
    
    def apply_ducking(self, main_audio, sidechain_audio, main_gain_db, sidechain_gain_db, 
                      threshold_db, reduction_db, attack_ms, release_ms):
        if not self.lib_manager.loaded:
            print("DuckCompressor: Library not loaded. Returning original audio.")
            return (main_audio,)
        
        try:
            # Extract audio data
            main_waveform = main_audio['waveform']
            main_sample_rate = main_audio['sample_rate']
            
            sidechain_waveform = sidechain_audio['waveform']
            sidechain_sample_rate = sidechain_audio['sample_rate']
            
            # Make a copy of the output tensor to store the processed results
            output_waveform = torch.zeros_like(main_waveform)
            
            # Process each batch
            for b in range(main_waveform.shape[0]):
                # Sum sidechain channels to mono if multi-channel
                if sidechain_waveform.shape[1] > 1:
                    # If multi-channel sidechain, sum all channels to mono
                    sidechain_sum = torch.sum(sidechain_waveform[b], dim=0) / sidechain_waveform.shape[1]
                else:
                    # Single channel sidechain
                    sidechain_sum = sidechain_waveform[b, 0]
                
                # Convert sidechain to numpy for processing
                sidechain_np = sidechain_sum.detach().cpu().numpy().astype(np.float32)
                
                # Ensure the sidechain array is C-contiguous
                if not sidechain_np.flags['C_CONTIGUOUS']:
                    sidechain_np = np.ascontiguousarray(sidechain_np)
                
                # Get sidechain pointer and length
                sidechain_ptr = sidechain_np.ctypes.data_as(POINTER(c_float))
                sidechain_length = len(sidechain_np)
                
                # Process each channel of the main audio
                for c in range(main_waveform.shape[1]):
                    # Extract channel data
                    main_channel = main_waveform[b, c].detach().cpu().numpy().astype(np.float32)
                    
                    # Ensure the main audio array is C-contiguous
                    if not main_channel.flags['C_CONTIGUOUS']:
                        main_channel = np.ascontiguousarray(main_channel)
                    
                    # Get main audio pointer and length
                    main_ptr = main_channel.ctypes.data_as(POINTER(c_float))
                    main_length = len(main_channel)
                    
                    # Call the library function
                    with model_management.interrupt_processing_mutex:  # Thread safety for ComfyUI
                        result_ptr = self.lib_manager.process_ducking(
                            main_ptr,
                            main_length,
                            main_sample_rate,
                            main_gain_db,
                            sidechain_ptr,
                            sidechain_length,
                            sidechain_sample_rate,
                            sidechain_gain_db,
                            threshold_db,
                            reduction_db,
                            attack_ms,
                            release_ms
                        )
                    
                    if result_ptr:
                        try:
                            # Access the result data
                            result = result_ptr.contents
                            
                            # Get the processed audio data
                            processed_length = result.length
                            processed_data = np.ctypeslib.as_array(
                                result.audio_ptr, 
                                shape=(processed_length,)
                            )
                            
                            # Copy the processed data to the output tensor
                            output_channel = torch.from_numpy(processed_data.copy())
                            output_waveform[b, c, :len(output_channel)] = output_channel.to(main_waveform.device)
                            
                            # Free the result memory
                            self.lib_manager.free_processing_result(result_ptr)
                        except Exception as e:
                            print(f"DuckCompressor: Error processing result: {e}")
                            # Return original audio on error
                            return (main_audio,)
                    else:
                        print("DuckCompressor: Processing returned null result")
                        return (main_audio,)
            
            # Create the output audio dictionary
            processed_audio = {"waveform": output_waveform, "sample_rate": main_sample_rate}
            return (processed_audio,)
            
        except Exception as e:
            print(f"DuckCompressor: Error during processing: {e}")
            return (main_audio,)
    

class SoundFlow_EqualizerNode:
    """
    ComfyUI Node for 7-Band Equalizer with individual gain controls
    """
    def __init__(self):
        self.bands = [
            {"freq": 60,    "q": 1.0},  # Sub-bass
            {"freq": 170,   "q": 1.0},  # Bass
            {"freq": 350,   "q": 1.0},  # Low midrange
            {"freq": 1000,  "q": 1.0},  # Midrange
            {"freq": 3500,  "q": 1.0},  # Upper midrange
            {"freq": 10000, "q": 1.0},  # Presence/treble
            {"freq": 20000, "q": 1.0},  # Brilliance/air
        ]

    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "audio": ("AUDIO",),
                "band1": ("FLOAT", {"default": 0.5, "min": -24.0, "max": 24.0, "step": 0.01}),
                "band2": ("FLOAT", {"default": 0.5, "min": -24.0, "max": 24.0, "step": 0.01}),
                "band3": ("FLOAT", {"default": 0.5, "min": -24.0, "max": 24.0, "step": 0.01}),
                "band4": ("FLOAT", {"default": 0.5, "min": -24.0, "max": 24.0, "step": 0.01}),
                "band5": ("FLOAT", {"default": 0.5, "min": -24.0, "max": 24.0, "step": 0.01}),
                "band6": ("FLOAT", {"default": 0.5, "min": -24.0, "max": 24.0, "step": 0.01}),
                "band7": ("FLOAT", {"default": 0.5, "min": -24.0, "max": 24.0, "step": 0.01}),
            },
        }


    RETURN_TYPES = ("AUDIO",)
    RETURN_NAMES = ("audio",)
    FUNCTION = "process_audio"
    CATEGORY = "Audio/Effects"

    def process_audio(self, audio, **kwargs):  # Accept keyword arguments to match new labels
        waveform = audio['waveform'].clone()
        sample_rate = audio['sample_rate']

        # Ensure sample rate is 44100 Hz
        target_sample_rate = 44100
        if sample_rate != target_sample_rate:
            # Resample to 44100 Hz
            waveform = tfaudio.resample(waveform, sample_rate, target_sample_rate)
            sample_rate = target_sample_rate
        
        # Extract band gains from kwargs
        gains = [kwargs["band1"], kwargs["band2"], kwargs["band3"], kwargs["band4"], 
                 kwargs["band5"], kwargs["band6"], kwargs["band7"]]
        
        # Work on a copy of the input waveform
        output = waveform.clone()
        
        # Apply input gain reduction to prevent potential clipping
        output = tfaudio.gain(output, -12.0)
        
        # Process audio with overlap-add to prevent clicks
        chunk_size = 44100 * 30  # 5 second chunks (shorter chunks for better progress indication)
        overlap = 1024  # Overlap size to prevent boundary artifacts
        
        total_samples = waveform.shape[-1]
        
        # Calculate number of chunks with overlap
        num_chunks = (total_samples - overlap) // (chunk_size - overlap)
        if total_samples > (num_chunks * (chunk_size - overlap) + overlap):
            num_chunks += 1  # Add one more chunk for the remainder
        
        # Create progress bar
        pbar = ProgressBar(num_chunks)
        
        # Create output buffer
        output_buffer = torch.zeros_like(output)
        
        # Create window for smooth crossfading between chunks
        window = torch.hann_window(overlap * 2, dtype=output.dtype, device=output.device)
        fade_in = window[:overlap]
        fade_out = window[overlap:]
        
        # Process each chunk with overlapping
        for i in range(num_chunks):
            # Calculate chunk boundaries with overlap
            start = i * (chunk_size - overlap)
            end = min(start + chunk_size, total_samples)
            
            # Get current chunk
            chunk = output[..., start:end].clone()
            
            # Apply each EQ band to the chunk
            for j, band in enumerate(self.bands):
                freq = band["freq"]
                q = band["q"]
                gain = gains[j] * 12  # Scale to +-12dB range
                
                if gain != 0.0:  # Skip processing if gain is zero
                    chunk = tfaudio.equalizer_biquad(chunk, sample_rate, freq, gain, q)
            
            # Apply fade in/out to chunk boundaries for smooth transitions
            if i > 0:  # Apply fade-in to all chunks except the first
                chunk_size = chunk.shape[-1]
                if chunk_size > overlap:
                    chunk[..., :overlap] *= fade_in
            
            if i < num_chunks - 1:  # Apply fade-out to all chunks except the last
                chunk_size = chunk.shape[-1]
                if chunk_size > overlap:
                    chunk[..., -overlap:] *= fade_out
            
            # Add processed chunk to output buffer
            output_buffer[..., start:end] += chunk
            
            # Update progress bar
            pbar.update(1)
        
        # Match output loudness to input loudness
        input_rms = torch.sqrt(torch.mean(waveform ** 2))
        output_rms = torch.sqrt(torch.mean(output_buffer ** 2))
        
        if output_rms > 1e-7:  # Prevent division by zero
            gain_factor = input_rms / output_rms
            output_buffer = output_buffer * gain_factor
            
        return ({"waveform": output_buffer, "sample_rate": sample_rate},)
    
class SoundFlow_GainPitchControlNode:
    """
    ComfyUI Node for controlling audio gain and pitch with professional mixer-style controls
    """
    def __init__(self):
        pass

    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "audio": ("AUDIO",),
                "gain": ("FLOAT", {"default": 0.0, "min": -24.0, "max": 24.0, "step": 0.1}),
                "pitch": ("FLOAT", {"default": 0.0, "min": -12.0, "max": 12.0, "step": 0.1}),
            },
        }

    RETURN_TYPES = ("AUDIO",)
    RETURN_NAMES = ("audio",)
    FUNCTION = "process_audio"
    CATEGORY = "Audio/Effects"


    def process_audio(self, audio, gain=0.0, pitch=0.0, chunk_size=44100):
        """
        Adjust the gain and pitch of an audio signal in chunks, reporting progress to ComfyUI.
        
        Args:
            audio (dict): Input audio dictionary containing waveform and sample_rate
            gain (float): Gain factor (in dB)
            pitch (float): Pitch shift in semitones
            chunk_size (int): Number of samples per chunk
        """
        
        waveform = audio['waveform'].clone()
        sample_rate = audio['sample_rate']

        total_samples = waveform.shape[-1]
        num_chunks = (total_samples + chunk_size - 1) // chunk_size

        # Calculate gain factor
        gain_factor = 10 ** (gain / 20.0)

        # For pitch shifting, we only need one resampler since we want time stretching
        if pitch != 0.0:
            pitch_factor = 2 ** (-pitch / 12.0)
            
            # Convert to rational approximation for more efficient processing
            from fractions import Fraction
            
            # Convert the floating point ratio to a rational approximation
            # This helps avoid inefficient processing with irrational ratios
            ratio = Fraction(pitch_factor).limit_denominator(1000)
            
            # Create resampler with rational approximation
            resampler = T.Resample(
                orig_freq=ratio.denominator * sample_rate, 
                new_freq=ratio.numerator * sample_rate
            )

        processed_chunks = []
        pbar = ProgressBar(num_chunks)

        for i in range(num_chunks):
            start = i * chunk_size
            end = min(start + chunk_size, total_samples)
            chunk = waveform[..., start:end]

            # Apply gain
            chunk = chunk * gain_factor
            chunk = torch.clamp(chunk, -1.0, 1.0)

            # Apply pitch shifting (which will also time-stretch)
            if pitch != 0.0 and chunk.shape[-1] > 1:
                # Apply the resampler to change pitch (will also change duration)
                chunk = resampler(chunk)

            processed_chunks.append(chunk)
            pbar.update(1)  # Update progress

        # Concatenate all processed chunks
        modified_waveform = torch.cat(processed_chunks, dim=-1)

        return ({"waveform": modified_waveform, "sample_rate": sample_rate},)


class SoundFlow_PreviewAudioNode:
    def __init__(self):
        self.output_dir = folder_paths.get_temp_directory()
        self.type = "temp"
        self.prefix_append = "soundflow_preview_audio"
        self.num_samples = 1024  # Number of points for downsampled waveform
        self.unique_id = str(uuid.uuid4()) # Generate a unique ID for this instance
        
    @classmethod
    def INPUT_TYPES(s):
        return {"required": {
            "audio": ("AUDIO",),
            },
        }
    
    RETURN_TYPES = ()
    FUNCTION = "run"
    CATEGORY = "SoundFlow/Audio"
    INPUT_IS_LIST = False
    OUTPUT_IS_LIST = ()
    OUTPUT_NODE = True

    def process_waveform(self, waveform):
        """Pre-Downsample the waveform to create visualization data"""

        # Convert to numpy for easier processing
        if isinstance(waveform, np.ndarray):
            audio_data = waveform
        else:
            audio_data = waveform.squeeze(0).numpy()
        
        # If stereo, convert to mono by averaging channels
        if len(audio_data.shape) > 1 and audio_data.shape[0] > 1:
            audio_data = np.mean(audio_data, axis=0)
        
        # Ensure 1D array
        audio_data = audio_data.flatten()
        
        # Calculate the block size for downsampling
        total_samples = len(audio_data)
        block_size = max(1, total_samples // self.num_samples)
        
        # Create downsampled data
        peaks = []
        for i in range(self.num_samples):
            block_start = min(i * block_size, total_samples - 1)
            block_end = min(block_start + block_size, total_samples)
            
            if block_start >= block_end:
                # We've reached the end of the audio data
                break
                
            # Get the average absolute amplitude in this block
            block = audio_data[block_start:block_end]
            peak = np.mean(np.abs(block))
            
            # Normalize and add minimum height for visibility
            peaks.append(float(peak))  # Ensure it's a standard Python float
            
        # Pad with zeros if we didn't get enough points
        while len(peaks) < self.num_samples:
            peaks.append(0.1)  # Minimum height

        return peaks
  
    def run(self, audio):
        # Check if input is a Tensor type
        is_tensor = not isinstance(audio, dict)
        if not is_tensor and 'waveform' in audio and 'sample_rate' in audio:
            # {'waveform': tensor([], size=(1, 1, 0)), 'sample_rate': 44100}
            is_tensor = True

        if is_tensor:
            # Add unique ID to the filename prefix to prevent conflicts
            filename_prefix = f"{self.prefix_append}_{self.unique_id}"
            full_output_folder, filename, counter, subfolder, filename_prefix = folder_paths.get_save_image_path(filename_prefix, self.output_dir)
            results = []
            
            file = f"{filename}_{counter:05}_.flac"
            
            # Save the audio file for playback
            torchaudio.save(os.path.join(full_output_folder, file), audio['waveform'].squeeze(0), audio["sample_rate"])
            
            # Process waveform data
            waveform_data = self.process_waveform(audio['waveform'])
            duration = len(audio['waveform'].squeeze(0)[0]) / audio["sample_rate"]
            
            # Convert waveform data to base64 string
            waveform_json = json.dumps({"waveform": waveform_data, "duration": duration})
            waveform_base64 = base64.b64encode(waveform_json.encode('utf-8')).decode('utf-8')
            
            # Add the result with waveform data
            results.append({
                "filename": file,
                "subfolder": subfolder,
                "type": self.type,
                "waveform_data": waveform_base64,
                "node_id": self.unique_id  # Include node ID in the result for reference
            })
        else:
            results = [audio]

        return {"ui": {"audio": results}}     
        
# Update the node mappings
NODE_CLASS_MAPPINGS = {
    "SoundFlow_Mixer": SoundFlow_MixerNode,
    "SoundFlow_SilenceTrimmer": SoundFlow_SilenceTrimmerNode,
    "SoundFlow_Concatenator": SoundFlow_ConcatenatorNode,
    "SoundFlow_GetLength": SoundFlow_GetLengthNode,
    "SoundFlow_SetLength": SoundFlow_SetLengthNode,
    "SoundFlow_TrimAudio": SoundFlow_TrimAudioNode,
    "SoundFlow_Fade": SoundFlow_FadeNode,
    "SoundFlow_DuckCompressor": SoundFlow_DuckCompressorNode,
    "SoundFlow_SimpleCompressor": SoundFlow_SimpleCompressorNode,
    "SoundFlow_Equalizer": SoundFlow_EqualizerNode,
    "SoundFlow_GainPitchControl": SoundFlow_GainPitchControlNode,
    "SoundFlow_PreviewAudio": SoundFlow_PreviewAudioNode,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "SoundFlow_Mixer": "Audio Mixer",
    "SoundFlow_SilenceTrimmer": "Audio Silence Trimmer",
    "SoundFlow_Concatenator": "Audio Concatenator",
    "SoundFlow_GetLength": "Audio Get Length",
    "SoundFlow_SetLength": "Audio Set Length",
    "SoundFlow_TrimAudio": "Audio Trim",
    "SoundFlow_Fade": "Audio Fade In/Out",
    "SoundFlow_DuckCompressor": "Audio Ducking (EffectsLib)",
    "SoundFlow_SimpleCompressor": "Audio Simple Compressor (EffectsLib)",
    "SoundFlow_Equalizer": "Audio 7-Band Equalizer",
    "SoundFlow_GainPitchControl": "Audio Gain/Pitch Control",
    "SoundFlow_PreviewAudio": "Preview Audio",
}