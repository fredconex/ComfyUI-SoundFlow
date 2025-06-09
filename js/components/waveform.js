import { BaseUIComponent } from "./base.js";

export class WaveformComponent extends BaseUIComponent {
    constructor(parent, options) {
        super(parent, options);
        this.peakWidth = options.peakWidth || 1;
        this.data = options.data || [];
        this.progress = options.progress || 0.0;
        this.duration = options.duration || 0.0;
        this.onChange = options.onChange || null;
    }

    clearWaveform() {
        this.data = [];
        this.duration = 0;
        this.progress = 0;
    }

    loadWaveform(data, duration) {
        this.data = data;
        this.duration = duration;
    }

    formatTime = function (seconds) {
        const totalSeconds = Math.floor(seconds);
        const h = Math.floor(totalSeconds / 3600);
        const m = Math.floor((totalSeconds % 3600) / 60);
        const s = totalSeconds % 60;
        return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    };

    shadeColor(color, percent) {
        /* ... same helper ... */
        let R, G, B;
        if (color.startsWith("#")) {
            R = parseInt(color.substring(1, 3), 16);
            G = parseInt(color.substring(3, 5), 16);
            B = parseInt(color.substring(5, 7), 16);
        } else if (color.startsWith("rgb")) {
            const rgb = color.match(/\d+/g);
            if (!rgb || rgb.length < 3) return color;
            R = parseInt(rgb[0]);
            G = parseInt(rgb[1]);
            B = parseInt(rgb[2]);
        } else {
            return color;
        }
        R = Math.min(255, Math.max(0, parseInt((R * (100 + percent)) / 100)));
        G = Math.min(255, Math.max(0, parseInt((G * (100 + percent)) / 100)));
        B = Math.min(255, Math.max(0, parseInt((B * (100 + percent)) / 100)));
        return `rgb(${R},${G},${B})`;
    }

    _drawWaveform = function (ctx, x, y, width, height, progress) {
        const halfHeight = height / 2;
        const centerY = y + halfHeight;

        if (this.data.length === 0) {
            ctx.fillStyle = "rgba(150,150,150,0.7)";
            ctx.font = "16px Arial";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText("No audio", x + width / 2, centerY);
            return;
        }


        x = x + this.peakWidth;
        width = width - this.peakWidth * 2;

        // Draw time rulers
        ctx.strokeStyle = "rgba(100, 100, 100, 0.1)";
        ctx.lineWidth = 1;
        // Calculate number of middle rulers based on width
        const minSpacing = 96; // minimum spacing between rulers
        const maxRulers = Math.floor(width / minSpacing);
        const num_middle_rulers = Math.max(0, maxRulers - 2); // subtract 2 for start/end
        const total_rulers = num_middle_rulers + 2; // add back start/end

        // Draw rulers
        for (let i = 0; i < total_rulers; i++) {
            let xi;
            
            if (i === 0) {
                // Start ruler
                xi = 0;
            } else if (i === total_rulers - 1) {
                // End ruler
                xi = width;
            } else {
                // Middle rulers - evenly spaced
                xi = (width * (i / (total_rulers - 1)));
            }
            
            ctx.beginPath();
            ctx.moveTo(x + xi, y);
            ctx.lineTo(x + xi, y + height);
            ctx.stroke();

            if (this.duration > 0) {
                const timeValue = (this.duration * (i / (total_rulers - 1))).toFixed(1);
                ctx.fillStyle = "rgba(150,150,150,0.7)";
                ctx.font = "10px Arial";
                ctx.textAlign = "center";
                ctx.fillText(this.formatTime(timeValue), x + xi, y + height + 12);
            }
        }

        // Draw the center line
        ctx.strokeStyle = "rgba(100,100,100,0.3)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x, centerY);
        ctx.lineTo(x + width, centerY);
        ctx.stroke();

        // Draw waveform
        ctx.lineWidth = this.peakWidth;

        const rawData = this.data;
        if (!rawData || rawData.length === 0) {
            return; // Exit early if no data
        }

        const samples = rawData.length;
        const num_peaks = Math.floor(width / (this.peakWidth * 2));
        const kernelSamples = 15; // How many in-between samples to take
        const sampleSpan = 1 / (num_peaks - 1); // Relative space between peaks

        for (let i = 0; i < num_peaks; i++) {
            const relX = i / (num_peaks - 1);
            const xPos = x + (width * relX);
            
            // Calculate amplitude on-the-fly
            let sum = 0;
            let count = 0;
            
            for (let k = 0; k < kernelSamples; k++) {
                const offset = ((k / (kernelSamples - 1)) - 0.5) * sampleSpan;
                let sampleRel = relX + offset;
                
                // Clamp between 0 and 1
                sampleRel = Math.max(0, Math.min(1, sampleRel));
                
                const sampleIndex = sampleRel * (samples - 1);
                const lowerIndex = Math.floor(sampleIndex);
                const upperIndex = Math.min(lowerIndex + 1, rawData.length - 1);
                const t = sampleIndex - lowerIndex;
                
                // Linear interpolation
                const interpolatedValue = rawData[lowerIndex] * (1 - t) + rawData[upperIndex] * t;
                
                sum += interpolatedValue;
                count++;
            }
            
            const amplitude = (sum / count) * halfHeight;

            // Set color based on playback position
            ctx.strokeStyle = (i / (num_peaks - 1)) <= progress
                ? "rgb(179, 255, 0)"  // Played part
                : "rgb(52, 85, 0)";   // Unplayed part

            // Draw peak
            ctx.beginPath();
            ctx.moveTo(xPos, centerY);
            ctx.lineTo(xPos, centerY - amplitude);
            ctx.moveTo(xPos, centerY);
            ctx.lineTo(xPos, centerY + amplitude);
            ctx.stroke();
        }

        if (this.progress > 0) {
            const playheadX = x + width * this.progress;
            ctx.strokeStyle = "rgb(179, 255, 0)";
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(playheadX, y);
            ctx.lineTo(playheadX, y + height);
            ctx.stroke();
        };

        // Draw time indicator
        let currentProgress = parseFloat(this.progress * this.duration);
        if (isNaN(currentProgress)){ currentProgress = 0; }
        const formattedCurrentTime = this.formatTime(currentProgress);
        const formattedTotalTime = this.formatTime(parseFloat(this.duration));
        ctx.fillStyle = "rgba(150,150,150,0.7)";
        ctx.font = "13px Arial";
        ctx.textAlign = "right";
        ctx.fillText(`${formattedCurrentTime} / ${formattedTotalTime}`, x + width, y + 15);        
    }

    _drawSelf(ctx) {
        this._drawWaveform(ctx, this.abs_x, this.abs_y, this.width, this.height, this.progress);
    }

    _onMouseDownSelf(event, nodeRelMouse, canvas) {
        const { pointer } = canvas;
        const compRelMouse = this.getNodeRelMouseToCompRelMouse(nodeRelMouse);

        if (compRelMouse.x >= 0 && compRelMouse.x <= this.width && compRelMouse.y >= 0 && compRelMouse.y <= this.height) {
            // Set up pointer callbacks
            pointer.onClick = (upEvent) => {
                const progress = compRelMouse.x / this.width;
                this.progress = progress;
                if (this.onChange)  this.onChange(progress);
            };

            pointer.onDragStart = () => {
                // No action needed for drag start
            };

            pointer.onDrag = (dragEvent) => {
                // No action needed during drag
            };

            pointer.onDragEnd = (endEvent) => {
                // No action needed for drag end
            };

            return true;
        }
        return false;
    }
}
