use std::ffi::c_float;
use std::os::raw::c_int;
use std::slice;

const EPSILON: f32 = 1e-9;
const MIN_LINEAR_VALUE: f32 = 1e-7;

#[repr(C)]
pub struct CompressorSettings {
    threshold_db: f32,
    ratio: f32,
    attack_ms: f32,
    release_ms: f32,
    knee_db: f32,
    makeup_gain_db: f32,
}

#[derive(Default)]
struct CompressorState {
    envelope: f32,
}

fn db_to_linear(db: f32) -> f32 {
    10.0_f32.powf(db / 20.0)
}

fn linear_to_db_safe(lin: f32) -> f32 {
    if lin < MIN_LINEAR_VALUE {
        -140.0
    } else {
        20.0 * lin.log10()
    }
}

fn clamp_f32(val: f32, min: f32, max: f32) -> f32 {
    val.max(min).min(max)
}

// Resampler function using linear interpolation (for simplicity)
// In a production environment, you'd want to use a more sophisticated algorithm
fn resample(input: &[f32], src_rate: f32, dst_rate: f32) -> Vec<f32> {
    let src_len = input.len();
    let dst_len = ((src_len as f32) * dst_rate / src_rate).round() as usize;
    
    let mut output = vec![0.0; dst_len];
    let ratio = src_rate / dst_rate;
    
    for i in 0..dst_len {
        let src_pos = i as f32 * ratio;
        let src_idx = src_pos.floor() as usize;
        let frac = src_pos - src_idx as f32;
        
        if src_idx + 1 < src_len {
            output[i] = input[src_idx] * (1.0 - frac) + input[src_idx + 1] * frac;
        } else if src_idx < src_len {
            output[i] = input[src_idx];
        }
    }
    
    output
}

#[no_mangle]
pub extern "C" fn ProcessCompressor(
    waveform_ptr: *mut c_float,
    length: c_int,
    sample_rate: c_int,
    threshold_db: c_float,
    ratio: c_float,
    attack_ms: c_float,
    release_ms: c_float,
    knee_db: c_float,
    makeup_gain_db: c_float,
    mix: c_float,
) {
    let length = length as usize;
    let sample_rate = sample_rate as f32;
    let mix = mix as f32;

    if length == 0 || waveform_ptr.is_null() {
        return;
    }

    let waveform = unsafe { slice::from_raw_parts_mut(waveform_ptr, length) };
    let mut original_waveform = vec![0.0f32; length];
    if mix < 1.0 - EPSILON {
        original_waveform.clone_from_slice(waveform);
    }

    let settings = CompressorSettings {
        threshold_db,
        ratio,
        attack_ms,
        release_ms,
        knee_db,
        makeup_gain_db,
    };

    let makeup_gain_lin = db_to_linear(settings.makeup_gain_db);

    let attack_ms = settings.attack_ms.max(0.01);
    let release_ms = settings.release_ms.max(0.1);
    let attack_samples = (attack_ms / 1000.0 * sample_rate).max(1.0);
    let release_samples = (release_ms / 1000.0 * sample_rate).max(1.0);

    let alpha_att = (-1.0 / attack_samples as f64).exp() as f32;
    let alpha_rel = (-1.0 / release_samples as f64).exp() as f32;

    let mut state = CompressorState::default();

    for i in 0..length {
        let input_sample = waveform[i];
        let abs_input = input_sample.abs();

        state.envelope = if abs_input > state.envelope {
            alpha_att * state.envelope + (1.0 - alpha_att) * abs_input
        } else {
            alpha_rel * state.envelope + (1.0 - alpha_rel) * abs_input
        };

        if state.envelope < 0.0 {
            state.envelope = 0.0;
        }

        let env_db = linear_to_db_safe(state.envelope);
        let overshoot = env_db - settings.threshold_db;

        let mut gain_reduction_db = 0.0;

        if settings.ratio > 1.0 + EPSILON {
            if settings.knee_db <= EPSILON {
                if overshoot > 0.0 {
                    gain_reduction_db = overshoot * (1.0 - 1.0 / settings.ratio);
                }
            } else {
                let half_knee = settings.knee_db / 2.0;
                if overshoot > -half_knee {
                    if overshoot < half_knee {
                        let val_in_knee = overshoot + half_knee;
                        gain_reduction_db = (1.0 - 1.0 / settings.ratio)
                            * (val_in_knee * val_in_knee)
                            / (2.0 * settings.knee_db);
                    } else {
                        let reduction_at_top_of_knee =
                            (1.0 - 1.0 / settings.ratio) * settings.knee_db / 2.0;
                        gain_reduction_db = reduction_at_top_of_knee
                            + (overshoot - half_knee) * (1.0 - 1.0 / settings.ratio);
                    }
                }
            }
        }

        let mut gain_multiplier = db_to_linear(-gain_reduction_db);

        if !gain_multiplier.is_finite() {
            gain_multiplier = 1.0;
        } else if gain_multiplier < EPSILON {
            gain_multiplier = EPSILON;
        } else if gain_multiplier > 1.0 + EPSILON {
            gain_multiplier = 1.0;
        }

        waveform[i] = input_sample * gain_multiplier * makeup_gain_lin;
    }

    if mix < 1.0 - EPSILON {
        for i in 0..length {
            waveform[i] = original_waveform[i] * (1.0 - mix) + waveform[i] * mix;
        }
    }

    for sample in waveform.iter_mut() {
        *sample = clamp_f32(*sample, -0.999, 0.999);
    }
}

#[no_mangle]
pub extern "C" fn ProcessDucking(
    main_audio_ptr: *mut c_float,
    main_length: c_int,
    main_sample_rate: c_int,
    main_gain_db: c_float,
    sidechain_audio_ptr: *const c_float,
    sidechain_length: c_int,
    sidechain_sample_rate: c_int,
    sidechain_gain_db: c_float,
    threshold_db: c_float,
    reduction_db: c_float,
    attack_ms: c_float,
    release_ms: c_float,
) -> *mut ProcessingResult {
    if main_audio_ptr.is_null() || sidechain_audio_ptr.is_null() {
        return std::ptr::null_mut();
    }

    let main_length = main_length as usize;
    let sidechain_length = sidechain_length as usize;
    
    if main_length == 0 || sidechain_length == 0 {
        return std::ptr::null_mut();
    }

    let main_sample_rate = main_sample_rate as f32;
    let sidechain_sample_rate = sidechain_sample_rate as f32;

    // Read input audio data
    let main_audio_slice = unsafe { slice::from_raw_parts(main_audio_ptr, main_length) };
    let sidechain_audio_slice = unsafe { slice::from_raw_parts(sidechain_audio_ptr, sidechain_length) };

    // Apply input gains
    let main_gain = db_to_linear(main_gain_db);
    let sidechain_gain = db_to_linear(sidechain_gain_db);

    // Create copies with gain applied
    let main_audio: Vec<f32> = main_audio_slice.iter().map(|&s| s * main_gain).collect();
    let mut sidechain_audio: Vec<f32> = sidechain_audio_slice.iter().map(|&s| s * sidechain_gain).collect();

    // Resample sidechain if sample rates don't match
    if main_sample_rate != sidechain_sample_rate {
        sidechain_audio = resample(&sidechain_audio, sidechain_sample_rate, main_sample_rate);
    }

    // Determine processing length and prepare buffers
    let process_length = main_audio.len();
    let sidechain_processed_length = sidechain_audio.len();
    
    // Add fade-out to avoid sudden release at end of audio
    let fade_out_samples = (release_ms / 1000.0 * main_sample_rate) as usize;
    
    // Create a new buffer for the processed audio
    let mut output_audio = main_audio.clone();

    let settings = DuckCompressorSettings {
        threshold_db,
        reduction_db: -reduction_db.abs(), // Ensure reduction is positive since we're reducing gain
        attack_ms,
        release_ms,
    };

    // Maximum attenuation in linear scale (when fully ducked)
    let reduction_lin = db_to_linear(settings.reduction_db);
    
    // Threshold in linear scale
    let threshold_lin = db_to_linear(settings.threshold_db);

    // Time constants
    let attack_ms = settings.attack_ms.max(0.1); // Min 0.1ms
    let release_ms = settings.release_ms.max(1.0); // Min 1.0ms
    
    let attack_samples = (attack_ms / 1000.0 * main_sample_rate).max(1.0);
    let release_samples = (release_ms / 1000.0 * main_sample_rate).max(1.0);

    // Smoothing coefficients
    let alpha_att = (-1.0 / attack_samples as f64).exp() as f32;
    let alpha_rel = (-1.0 / release_samples as f64).exp() as f32;

    let mut state = DuckCompressorState::default();

    // Processing loop - only up to the minimum of both lengths
    let overlap_length = process_length.min(sidechain_processed_length);

    // Process overlapping portion with ducking
    for i in 0..overlap_length {
        // Extract the sidechain signal level (voice)
        let sidechain_sample = sidechain_audio[i];
        let abs_sidechain = sidechain_sample.abs();

        // Envelope follower on sidechain signal (similar to peak detector)
        state.envelope = if abs_sidechain > state.envelope {
            alpha_att * state.envelope + (1.0 - alpha_att) * abs_sidechain
        } else {
            alpha_rel * state.envelope + (1.0 - alpha_rel) * abs_sidechain
        };

        // Ensure envelope stays positive
        if state.envelope < 0.0 {
            state.envelope = 0.0;
        }

        // Determine gain reduction amount based on sidechain level
        let target_gain_reduction = if state.envelope > threshold_lin {
            // Above threshold - apply ducking
            reduction_lin
        } else {
            // Below threshold - no ducking
            1.0
        };

        // Smooth the gain reduction (separate attack/release for gain changes)
        if target_gain_reduction < state.gain_reduction {
            // Going down (more reduction) - use attack time
            state.gain_reduction = alpha_att * state.gain_reduction + (1.0 - alpha_att) * target_gain_reduction;
        } else {
            // Going up (less reduction) - use release time
            state.gain_reduction = alpha_rel * state.gain_reduction + (1.0 - alpha_rel) * target_gain_reduction;
        }

        // Apply gain reduction to main signal
        output_audio[i] = main_audio[i] * state.gain_reduction + sidechain_audio[i];
    }

    // Apply gentle release for the remainder of the main audio after sidechain ends
    if process_length > overlap_length {
        // Get the final gain reduction value at the end of the sidechain
        let final_gain_reduction = state.gain_reduction;
        
        // Calculate how many samples to fade out (bounded by remaining samples)
        let fade_out_length = fade_out_samples.min( process_length - overlap_length);
        
        for i in 0..fade_out_length {
            // Linearly interpolate from final_gain_reduction to 1.0
            let progress = i as f32 / fade_out_length as f32;
            let current_reduction = final_gain_reduction + (1.0 - final_gain_reduction) * progress;
            
            // Apply the fading gain reduction
            let idx = overlap_length + i;
            output_audio[idx] = main_audio[idx] * current_reduction;
        }
        
        // Copy any remaining audio unchanged
        if overlap_length + fade_out_length < process_length {
            for i in (overlap_length + fade_out_length)..process_length {
                output_audio[i] = main_audio[i];
            }
        }
    }

    // Create and return result
    let result = Box::new(ProcessingResult {
        audio_ptr: output_audio.as_mut_ptr(),
        length: output_audio.len() as c_int,
        sample_rate: main_sample_rate as c_int,
        _audio_data: output_audio, // Keep the Vec alive
    });

    Box::into_raw(result)
}

// State struct to maintain compressor state
#[derive(Default)]
struct DuckCompressorState {
    envelope: f32,       // Envelope follower value
    gain_reduction: f32, // Current gain reduction value (1.0 = no reduction)
}

// Settings struct for compressor parameters
struct DuckCompressorSettings {
    threshold_db: f32,  // Threshold in dB
    reduction_db: f32,  // Amount of gain reduction in dB
    attack_ms: f32,     // Attack time in ms
    release_ms: f32,    // Release time in ms
}

// Result struct to return processed audio
#[repr(C)]
pub struct ProcessingResult {
    audio_ptr: *mut f32,
    length: c_int,
    sample_rate: c_int,
    _audio_data: Vec<f32>, // This field ensures the Vec memory stays alive
}

#[no_mangle]
pub extern "C" fn FreeProcessingResult(result: *mut ProcessingResult) {
    if !result.is_null() {
        unsafe {
            drop(Box::from_raw(result));
        }
    }
}