import os
import ctypes
from ctypes import c_float, c_int, POINTER, Structure
import platform
import traceback

class SoundFlowLibraryManager:
    """
    Manages loading and interfacing with the shared libraries used by SoundFlow audio effects.
    This class centralizes the library loading process across different platforms.
    """
    def __init__(self, lib_base_name="lib/effects"):
        """
        Initialize the library manager.
        
        Args:
            lib_base_name (str): Base name of the library without platform-specific extensions
        """
        self.lib_base_name = lib_base_name
        self.lib = None
        self.loaded = False
        
        # Define ProcessingResult structure for returning data from library functions
        class ProcessingResult(Structure):
            _fields_ = [
                ("audio_ptr", POINTER(c_float)),
                ("length", c_int),
                ("sample_rate", c_int)
            ]
        
        self.ProcessingResult = ProcessingResult
        
    def load_library(self):
        """
        Load the shared library for audio effects, handling platform-specific details.
        
        Returns:
            bool: True if library loaded successfully, False otherwise
        """
        try:
            # Determine platform-specific library names
            if os.name == 'nt':  # Windows
                lib_names = [f'{self.lib_base_name}.dll', f'lib{self.lib_base_name}.dll']
            elif os.name == 'posix':
                if platform.system() == 'Darwin':  # macOS
                    lib_names = [f'lib{self.lib_base_name}.dylib']
                else:  # Linux and other POSIX
                    lib_names = [f'lib{self.lib_base_name}.so']
            else:
                raise RuntimeError(f"Unsupported platform: {os.name}")

            # Get the script directory for relative paths
            script_dir = os.path.dirname(os.path.abspath(__file__))
            loaded_path = None

            # Try each possible library name until one loads
            for lib_name in lib_names:
                lib_path = os.path.join(script_dir, lib_name)
                print(f"SoundFlow: Trying to load library from {lib_path}")
                
                if os.path.exists(lib_path):
                    try:
                        # Load with RTLD_GLOBAL if available (helps with symbol visibility)
                        if hasattr(ctypes, 'RTLD_GLOBAL'):
                            self.lib = ctypes.CDLL(lib_path, mode=ctypes.RTLD_GLOBAL)
                        else:
                            self.lib = ctypes.CDLL(lib_path)
                        loaded_path = lib_path
                        break 
                    except Exception as e:
                        print(f"SoundFlow: Failed to load {lib_path}: {str(e)}")
                else:
                    print(f"SoundFlow: Library not found at {lib_path}")
            
            # Handle case where no library was loaded
            if not loaded_path:
                error_message = (
                    f"Could not find or load the {self.lib_base_name} library. "
                    f"Ensure it's compiled and placed in the same directory as this script ({script_dir}). "
                    f"Expected names: {', '.join(lib_names)}"
                )
                raise FileNotFoundError(error_message)

            print(f"SoundFlow: Successfully loaded library from {loaded_path}")
            
            # Setup function signatures
            self._setup_function_signatures()
            
            self.loaded = True
            return True
            
        except Exception as e:
            print(f"SoundFlow: Critical error during library loading: {e}")
            print(traceback.format_exc())
            self.loaded = False
            return False
    
    def _setup_function_signatures(self):
        """Configure the function signatures for the loaded library"""
        if not self.lib:
            return
            
        # Define the function signature for ProcessCompressor (compressor)
        self.lib.ProcessCompressor.argtypes = [
            ctypes.POINTER(c_float),  # waveform_ptr
            c_int,                    # length
            c_int,                    # sample_rate
            c_float,                  # threshold_db
            c_float,                  # ratio
            c_float,                  # attack_ms
            c_float,                  # release_ms
            c_float,                  # knee_db
            c_float,                  # makeup_gain_db
            c_float                   # mix
        ]
        self.lib.ProcessCompressor.restype = None  # Function returns void
        
        # Define the function signature for ProcessDucking
        self.lib.ProcessDucking.argtypes = [
            POINTER(c_float),   # main_audio_ptr
            c_int,              # main_length
            c_int,              # main_sample_rate
            c_float,            # main_gain_db
            POINTER(c_float),   # sidechain_audio_ptr
            c_int,              # sidechain_length
            c_int,              # sidechain_sample_rate
            c_float,            # sidechain_gain_db
            c_float,            # threshold_db
            c_float,            # reduction_db
            c_float,            # attack_ms
            c_float             # release_ms
        ]
        self.lib.ProcessDucking.restype = POINTER(self.ProcessingResult)
        
        # Function to free resources
        self.lib.FreeProcessingResult.argtypes = [POINTER(self.ProcessingResult)]
        self.lib.FreeProcessingResult.restype = None
    
    def process_compressor(self, waveform_ptr, length, sample_rate,
                     threshold_db, ratio, attack_ms, release_ms, 
                     knee_db, makeup_gain_db, mix):
        """
        Wrapper for the ProcessCompressor function in the shared library.
        
        Args:
            waveform_ptr: Pointer to audio data
            length: Number of samples
            sample_rate: Audio sample rate in Hz
            threshold_db: Compression threshold in dB
            ratio: Compression ratio
            attack_ms: Attack time in ms
            release_ms: Release time in ms
            knee_db: Knee width in dB
            makeup_gain_db: Makeup gain in dB
            mix: Dry/wet mix (0.0-1.0)
            
        Returns:
            None (modifies data in-place)
        """
        if not self.loaded or not self.lib:
            print("SoundFlow: Library not loaded. Cannot process audio.")
            return False
            
        self.lib.ProcessCompressor(
            waveform_ptr,
            c_int(length),
            c_int(sample_rate),
            c_float(threshold_db),
            c_float(ratio),
            c_float(attack_ms),
            c_float(release_ms),
            c_float(knee_db),
            c_float(makeup_gain_db),
            c_float(mix)
        )
        return True
        
    def process_ducking(self, main_ptr, main_length, main_sample_rate, main_gain_db,
                       sidechain_ptr, sidechain_length, sidechain_sample_rate, sidechain_gain_db,
                       threshold_db, reduction_db, attack_ms, release_ms):
        """
        Wrapper for the ProcessDucking function in the shared library.
        
        Args:
            main_ptr: Pointer to main audio data
            main_length: Length of main audio
            main_sample_rate: Main audio sample rate
            main_gain_db: Main audio gain in dB
            sidechain_ptr: Pointer to sidechain audio data
            sidechain_length: Length of sidechain audio
            sidechain_sample_rate: Sidechain audio sample rate
            sidechain_gain_db: Sidechain audio gain in dB
            threshold_db: Threshold for ducking in dB
            reduction_db: Amount of gain reduction in dB
            attack_ms: Attack time in ms
            release_ms: Release time in ms
            
        Returns:
            Pointer to ProcessingResult structure or None on error
        """
        if not self.loaded or not self.lib:
            print("SoundFlow: Library not loaded. Cannot process ducking.")
            return None
            
        return self.lib.ProcessDucking(
            main_ptr,
            c_int(main_length),
            c_int(main_sample_rate),
            c_float(main_gain_db),
            sidechain_ptr,
            c_int(sidechain_length),
            c_int(sidechain_sample_rate),
            c_float(sidechain_gain_db),
            c_float(threshold_db),
            c_float(reduction_db),
            c_float(attack_ms),
            c_float(release_ms)
        )
    
    def free_processing_result(self, result_ptr):
        """
        Free resources allocated by the library.
        
        Args:
            result_ptr: Pointer to ProcessingResult structure
        """
        if self.loaded and self.lib and result_ptr:
            self.lib.FreeProcessingResult(result_ptr)

# Create a singleton instance for shared access
_library_manager = None

def get_library_manager(lib_base_name="lib/effects"):
    """
    Get the singleton library manager instance.
    
    Args:
        lib_base_name (str): Base name of the library
        
    Returns:
        SoundFlowLibraryManager: Singleton library manager instance
    """
    global _library_manager
    if _library_manager is None:
        _library_manager = SoundFlowLibraryManager(lib_base_name)
        _library_manager.load_library()
    return _library_manager