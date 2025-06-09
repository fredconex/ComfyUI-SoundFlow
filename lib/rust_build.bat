@echo off
cargo build --release -p effects
copy /Y target\release\effects.dll effects.dll
pause