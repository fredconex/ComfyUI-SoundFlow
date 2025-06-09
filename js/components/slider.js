import { BaseUIComponent } from "./base.js";

export class SliderComponent extends BaseUIComponent {
    constructor(parent, options = {}) {
        // Define default slider-specific options
        const defaultSliderOptions = {
            label: "SLIDER",
            labelVisible: true,
            value: 0,
            min: 0,
            max: 1,
            step: 0.01,
            color: "rgb(122, 156, 0)", // Main color for fill and handle
            unit: "",
            precision: 2, // Default precision to 2 for 0.01 step
            showTicks: true,
            tickCount: 5,
            tickLabels: null,
            tickAlignment: "auto",
            tickLabelOffset: 5,
            magneticTicks: true,
            subTickSteps: 5,
            onChange: null,
            // BaseUIComponent options like x, y, width, height are handled by super if passed in options
        };

        // Merge provided options with defaults, then pass to super
        const mergedOptions = Object.assign({}, defaultSliderOptions, options);
        super(parent, mergedOptions); // Pass all merged options to BaseUIComponent
        this.sliderOptions = {};
        for (const key in defaultSliderOptions) {
            this.sliderOptions[key] = mergedOptions[key];
        }
        // Ensure value is within min/max initially
        this.sliderOptions.value = Math.max(this.sliderOptions.min, Math.min(this.sliderOptions.max, this.sliderOptions.value));
        this.isHovering = false;
        this.capHeight = 14;
        this.labelHeight = 20; // Approximate height for one line of label text
        this.colors = {
            background: "rgb(64,64,64)",
            text: LiteGraph.NODE_TEXT_COLOR, // Assuming LiteGraph context
            knobBorder: "rgba(0,0,0,0.4)",
            gridLines: "rgba(100,100,100,0.2)",
        };
        this.active = false; // Is the slider currently being dragged
    }

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

    getNormalizedValue() {
        const range = this.sliderOptions.max - this.sliderOptions.min;
        if (range === 0) return 0; // Avoid division by zero
        return (this.sliderOptions.value - this.sliderOptions.min) / range;
    }

    setValueFromNormalized(normalizedValue) {
        let value = this.sliderOptions.min + normalizedValue * (this.sliderOptions.max - this.sliderOptions.min);
        value = Math.max(this.sliderOptions.min, Math.min(this.sliderOptions.max, value));

        if (this.sliderOptions.step) {
            value = Math.round(value / this.sliderOptions.step) * this.sliderOptions.step;
        }

        // Apply precision
        const factor = Math.pow(10, this.sliderOptions.precision);
        value = Math.round(value * factor) / factor;

        if (this.sliderOptions.value !== value) {
            this.sliderOptions.value = value;
            if (this.sliderOptions.onChange) {
                this.sliderOptions.onChange(value);
            }
            if (this.node && this.node.setDirtyCanvas) this.node.setDirtyCanvas(true, false); // Redraw node
            return true;
        }
        return false;
    }

    // Add the missing setValue method that's being called in SoundFlowGainPitchControl
    setValue(value, skipCallback = false) {
        // Constrain to min/max
        value = Math.max(this.sliderOptions.min, Math.min(this.sliderOptions.max, value));

        // Apply step constraints
        if (this.sliderOptions.step) {
            value = Math.round(value / this.sliderOptions.step) * this.sliderOptions.step;
        }

        // Apply precision
        const factor = Math.pow(10, this.sliderOptions.precision);
        value = Math.round(value * factor) / factor;

        // Only update if the value actually changed
        if (this.sliderOptions.value !== value) {
            this.sliderOptions.value = value;

            // Trigger the callback unless explicitly skipped
            if (!skipCallback && this.sliderOptions.onChange) {
                this.sliderOptions.onChange(value);
            }

            // Request canvas redraw
            if (this.parent && this.parent.node && this.parent.node.setDirtyCanvas) {
                this.parent.node.setDirtyCanvas(true, false);
            }
            return true;
        }
        return false;
    }

    // Define your node's pointer event handlers
    
    _onMouseDownSelf(event, nodeRelMouse, canvas) {
        const { pointer } = canvas;
        const compRelMouse = this.getNodeRelMouseToCompRelMouse(nodeRelMouse);
        console.log('mousedown!');
        
        // Set up pointer callbacks
        pointer.onClick = (upEvent) => {
            // Handle regular click if no drag occurred
            // You might want to add logic here for simple clicks
            console.log('Click detected');
            this.updateValueFromMousePosition(compRelMouse.y, event.shiftKey);
        };
        
        pointer.onDragStart = () => {
            // Initialize drag state
            this.active = true;
        };
        
        pointer.onDrag = (dragEvent) => {
            // Handle ongoing drag
            if (this.active) {
                // Use canvasX/Y from the drag event
                const currentNodeRelMouse = { x: dragEvent.canvasX - this.node.pos[0], y: dragEvent.canvasY - this.node.pos[1]};
                const currentCompRelMouse = this.getNodeRelMouseToCompRelMouse(currentNodeRelMouse);
                this.updateValueFromMousePosition(currentCompRelMouse.y, dragEvent.shiftKey);
            }
        };
        
        pointer.onDragEnd = (endEvent, endPos) => {
            // Clean up drag state
            if (this.active) {
                this.active = false;
            }
        };
        
        return true; // Consumed event
    }

    _isMouseOver(compRelMouse) {
        const isOver = (
            compRelMouse.x >= 0 &&
            compRelMouse.x < this.width &&
            compRelMouse.y >= 0 &&
            compRelMouse.y < this.height
        );        
        return isOver;
    }

    _onMouseMoveSelf(event, nodeRelMouse, canvas) {
        const compRelMouse = this.getNodeRelMouseToCompRelMouse(nodeRelMouse);
        const isOver = this._isMouseOver(compRelMouse);

        if (isOver !== this.isHovering) {
            this.isHovering = isOver;

            if (this.node && this.node.setDirtyCanvas) {
                this.node.setDirtyCanvas(true, true);
            }
        }

        return isOver;
    }

    getNearestTickPosition(normalizedPos) {
        const tickCount = this.sliderOptions.tickCount || 5;
        const subTickSteps = this.sliderOptions.subTickSteps || 1;
        if (tickCount < 2 || subTickSteps < 1) {
            return normalizedPos;
        }
        const majorIntervals = tickCount - 1;
        const totalFineIntervals = majorIntervals * subTickSteps;
        if (totalFineIntervals === 0) {
            return normalizedPos;
        }
        let nearestTickNorm = 0;
        let minDistance = Infinity;
        for (let i = 0; i <= totalFineIntervals; i++) {
            const tickPosNorm = i / totalFineIntervals;
            const distance = Math.abs(normalizedPos - tickPosNorm);
            if (distance < minDistance) {
                minDistance = distance;
                nearestTickNorm = tickPosNorm;
            }
            if (minDistance < 1e-9) {
                break;
            }
        }
        return nearestTickNorm;
    }

    // Update value based on component-relative mouse Y
    updateValueFromMousePosition(compRelMouseY, isShiftKey) {
        // Use this.height (from BaseUIComponent, which is the slider's track height)
        let normalizedPos = 1 - Math.max(0, Math.min(1, compRelMouseY / this.height));

        if (isShiftKey && this.sliderOptions.magneticTicks) {
            normalizedPos = this.getNearestTickPosition(normalizedPos);
        }
        // No separate step handling here, setValueFromNormalized does that based on raw normalizedPos

        return this.setValueFromNormalized(normalizedPos);
    }

    _drawSelf(ctx) {
        // Use this.abs_x, this.abs_y, this.width, this.height from BaseUIComponent
        const { x, y, width, height } = {
            x: this.abs_x,
            y: this.abs_y,
            width: this.width,
            height: this.height,
        };
        const { label, unit, labelVisible, color, precision, showTicks, tickCount, tickLabels, tickAlignment, tickLabelOffset } = this.sliderOptions;

        const normalizedValue = 1 - this.getNormalizedValue(); // 0 at top, 1 at bottom for drawing
        const knobCenterY = y + normalizedValue * height;

        const trackVisualPadding = 2;
        const trackX = x + trackVisualPadding;
        const trackInnerWidth = Math.max(0, width - 2 * trackVisualPadding);

        // Draw track background with hover effect if needed
        ctx.fillStyle = this.colors.background;
        ctx.beginPath();
        ctx.roundRect(trackX, y, trackInnerWidth, height, 4);
        ctx.fill();

        // Draw tick marks
        if (showTicks && tickCount > 1) {
            ctx.strokeStyle = this.colors.gridLines;
            ctx.lineWidth = 1;

            for (let i = 0; i < tickCount; i++) {
                const yPos = y + i * (height / (tickCount - 1));
                ctx.beginPath();
                ctx.moveTo(trackX, yPos);
                ctx.lineTo(trackX + trackInnerWidth, yPos);
                ctx.stroke();

                if (tickLabels && tickLabels[i] !== undefined) {
                    ctx.fillStyle = this.colors.text;
                    ctx.font = "10px Arial";
                    let textDrawX;
                    const parentNodeWidth = this.node.size ? this.node.size[0] : Infinity; // Get node width for auto align
                    if (tickAlignment === "left" || (tickAlignment === "auto" && x <= parentNodeWidth / 2)) {
                        ctx.textAlign = "right";
                        textDrawX = x - tickLabelOffset;
                    } else {
                        ctx.textAlign = "left";
                        textDrawX = x + width + tickLabelOffset;
                    }
                    ctx.fillText(tickLabels[i], textDrawX, yPos + 3); // +3 for vertical centering
                }
            }
        }

        /*if (this.isHovering) {
            ctx.shadowColor = "rgba(255, 255, 255, 0.4)";
            ctx.shadowBlur = 8;
        }*/

        // Draw value fill
        const nColor = this.isHovering ? this.shadeColor(color, 15) : color;
        ctx.beginPath();
        const fillHeight = y + height - knobCenterY;
        if (fillHeight > 0.5) {
            // Min height to draw fill to avoid 0-pixel artifacts
            const fillGradient = ctx.createLinearGradient(x, knobCenterY, x, y + height);
            const darkerFillColor = this.shadeColor(nColor, -40);
            fillGradient.addColorStop(0, nColor);
            fillGradient.addColorStop(1, darkerFillColor);
            ctx.fillStyle = fillGradient;

            ctx.moveTo(trackX, knobCenterY);
            ctx.lineTo(trackX + trackInnerWidth, knobCenterY);
            ctx.lineTo(trackX + trackInnerWidth, y + height - 4);
            ctx.arcTo(trackX + trackInnerWidth, y + height, trackX + trackInnerWidth - 4, y + height, 4);
            ctx.lineTo(trackX + 4, y + height);
            ctx.arcTo(trackX, y + height, trackX, y + height - 4, 4);
            ctx.lineTo(trackX, knobCenterY);
            ctx.closePath();
            ctx.fill();
        }

        // Draw fader handle
        const handleTopY = Math.max(y, knobCenterY - this.capHeight / 2);
        const handleActualHeight = Math.min(this.capHeight, y + height - handleTopY);

        const gradient = ctx.createLinearGradient(x, handleTopY, x, handleTopY + handleActualHeight);
        const lighterColor = this.shadeColor(nColor, 30);
        const darkerColor = this.shadeColor(nColor, -20);
        gradient.addColorStop(0, lighterColor);
        gradient.addColorStop(0.3, nColor);
        gradient.addColorStop(0.7, nColor);
        gradient.addColorStop(1, darkerColor);

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.roundRect(x, handleTopY, width, handleActualHeight, 3);
        ctx.fill();

        ctx.strokeStyle = this.colors.knobBorder;
        ctx.lineWidth = 1;
        ctx.stroke();

        // Draw label and value text (below the slider based on its absolute Y and height)
        if (labelVisible) {
            ctx.fillStyle = this.colors.text;
            ctx.font = "12px Arial";
            ctx.textAlign = "center";
            // Position labels relative to the slider's full height (this.height from BaseUIComponent)
            const labelYPos = y + this.height + this.labelHeight * 0.75; // Adjusted for better baseline
            const valueYPos = y + this.height + this.labelHeight * 1.75;

            ctx.fillText(label, x + width / 2, labelYPos);

            const displayValue = `${this.sliderOptions.value.toFixed(precision)} ${unit}`;
            ctx.fillText(displayValue, x + width / 2, valueYPos);
        }
    }
}
