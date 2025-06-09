import { BaseUIComponent } from "./base.js";

// --- EqualizerGraphComponent ---
export class EqualizerGraphComponent extends BaseUIComponent {
    constructor(parent, options) {
        super(parent, options);
        this.activeBand = undefined; // Which band (1-7) is being dragged

        // Constants for drawing, can be overridden by options
        this.bandLabelHeight = options.bandLabelHeight || 12;
        this.bandLabelFont = options.bandLabelFont || "10px Arial";
        this.bandValueFont = options.bandValueFont || "9px Arial";
        this.bandPointRadius = options.bandPointRadius || 5;
        this.bandLineWidth = options.bandLineWidth || 2;
        this.gridLineColor = options.gridLineColor || "rgba(100,100,100,0.1)";
        this.bandLineColor = options.bandLineColor || "rgba(100,100,100,0.3)";
        this.graphLineColor = options.graphLineColor || "rgba(200, 255, 0, 0.8)";
        this.graphFillGradientStops = options.graphFillGradientStops || [
            { offset: 0, color: "rgba(122, 156, 0, 0.4)" },
            { offset: 0.7, color: "rgba(122, 156, 0, 0.0)" },
            { offset: 1, color: "rgba(122, 156, 0, 0.0)" },
        ];
        this.backgroundColor = options.backgroundColor || "rgba(20,20,20,0.8)";
        
        // Highlighting
        this.highlightedBand = undefined;
        this.highlightColor = options.highlightColor || "rgb(255, 255, 255)";
    }

    _drawSelf(ctx) {
        ctx.save();
        // EQ Background
        ctx.fillStyle = this.backgroundColor;
        ctx.beginPath();
        ctx.roundRect(this.abs_x, this.abs_y, this.width, this.height, 4);
        ctx.fill();

        // Horizontal Grid Lines (5 lines, 4 spaces)
        ctx.strokeStyle = this.gridLineColor;
        ctx.lineWidth = 1;
        for (let i = 0; i < 5; i++) {
            const y = this.abs_y + this.height * (1 - i / 4);
            ctx.beginPath();
            ctx.moveTo(this.abs_x, y);
            ctx.lineTo(this.abs_x + this.width, y);
            ctx.stroke();
        }

        const bandCount = 7;
        const bandSpacing = this.width / (bandCount - 1);

        // Band Frequencies Text (drawn below the EQ graph area)
        const bandFrequencies = ["60", "170", "350", "1k", "3.5k", "10k", "20k"];
        ctx.fillStyle = LiteGraph.NODE_TEXT_COLOR;
        ctx.font = this.bandLabelFont;
        ctx.textAlign = "center";
        const bandLabelYPos = this.abs_y + this.height + this.bandLabelHeight; // Positioned below the graph
        for (let i = 0; i < bandCount; i++) {
            const x = this.abs_x + i * bandSpacing;
            ctx.fillText(bandFrequencies[i], x, bandLabelYPos);
        }

        // Vertical Band Lines
        ctx.strokeStyle = this.bandLineColor;
        ctx.lineWidth = this.bandLineWidth;
        for (let i = 0; i < bandCount; i++) {
            const x = this.abs_x + i * bandSpacing;
            ctx.beginPath();
            ctx.moveTo(x, this.abs_y);
            ctx.lineTo(x, this.abs_y + this.height);
            ctx.stroke();
        }

        // EQ Graph Points and Line
        const points = [];
        for (let i = 1; i <= bandCount; i++) {
            const bandValue = this.node.properties[`band${i}`] || 0.0;
            const x = this.abs_x + (i - 1) * bandSpacing;
            const yVal = this.abs_y + (this.height / 2) * (1 - bandValue); // 0 value is center
            points.push({ x, y: yVal });
        }

        // Gradient Fill
        if (points.length > 0) {
            ctx.beginPath();
            ctx.moveTo(points[0].x, points[0].y);
            for (let i = 1; i < points.length; i++) {
                ctx.lineTo(points[i].x, points[i].y);
            }
            const bottomFillY = this.abs_y + this.height;
            ctx.lineTo(points[points.length - 1].x, bottomFillY); // Line to bottom right
            ctx.lineTo(points[0].x, bottomFillY); // Line to bottom left
            ctx.closePath(); // Line back to first point's Y (effectively)

            const gradient = ctx.createLinearGradient(0, this.abs_y, 0, this.abs_y + this.height);
            this.graphFillGradientStops.forEach((stop) => gradient.addColorStop(stop.offset, stop.color));
            ctx.fillStyle = gradient;
            ctx.fill();
        }

        // Connecting Line
        if (points.length > 0) {
            ctx.beginPath();
            ctx.strokeStyle = this.graphLineColor;
            ctx.lineWidth = this.bandLineWidth;
            ctx.moveTo(points[0].x, points[0].y);
            for (let i = 1; i < points.length; i++) {
                ctx.lineTo(points[i].x, points[i].y);
            }
            ctx.stroke();
        }

        // Circles and Band Values Text
        ctx.font = this.bandValueFont;
        for (let i = 0; i < points.length; i++) {
            const p = points[i];
            const bandValue = this.node.properties[`band${i + 1}`] || 0.0;
            // Circle
            ctx.fillStyle = (this.highlightedBand === i + 1) ? this.highlightColor : LiteGraph.NODE_TEXT_COLOR; // Or a specific point color
            ctx.beginPath();
            ctx.arc(p.x, p.y, this.bandPointRadius, 0, 2 * Math.PI);
            ctx.fill();
            // Text
            ctx.fillStyle = LiteGraph.NODE_TEXT_COLOR;
            ctx.fillText(bandValue.toFixed(2), p.x, p.y - (this.bandPointRadius + 2)); // Position above point
        }
        ctx.restore();
    }

    _onMouseDownSelf(event, nodeRelMouse, canvas) {
        const { pointer } = canvas;
        const compRelMouse = this.getNodeRelMouseToCompRelMouse(nodeRelMouse);

        const bandCount = 7;
        const bandSpacing = this.width / (bandCount - 1);

        // Check if click is near a band control point
        // More precise: check distance to each point, not just x-proximity
        for (let i = 0; i < bandCount; i++) {
            const bandName = `band${i + 1}`;
            const bandValue = this.node.properties[bandName] || 0.0;
            const pointX = i * bandSpacing; // Relative to component's x
            const pointY = (this.height / 2) * (1 - bandValue); // Relative to component's y center

            const distSq = (compRelMouse.x - pointX) ** 2 + (compRelMouse.y - pointY) ** 2;
            if (distSq < (this.bandPointRadius*5) ** 2) {
                // Click within radius + a bit of slack
                this.activeBand = i + 1;

                // Set up pointer callbacks
                pointer.onClick = (upEvent) => {
                    // Handle single click - just clean up since we already updated on mouse down
                    this.activeBand = undefined;
                    this.node.setDirtyCanvas(true, true);
                };
                
                pointer.onDragStart = () => {
                    // Drag start - we already updated on mouse down, so just ensure canvas is dirty
                    this.node.setDirtyCanvas(true, true);
                };
                
                pointer.onDrag = (dragEvent) => {
                    // Handle ongoing drag
                    if (this.activeBand !== undefined) {
                        // Convert canvas coordinates to node-relative coordinates
                        const nodePos = this.node.pos;
                        const currentNodeRelMouse = { 
                            x: dragEvent.canvasX - nodePos[0], 
                            y: dragEvent.canvasY - nodePos[1] 
                        };
                        this._updateBandValueFromMouse(dragEvent, currentNodeRelMouse);
                        this.node.setDirtyCanvas(true, true);
                    }
                };
                
                pointer.onDragEnd = (endEvent) => {
                    // Clean up drag state
                    if (this.activeBand !== undefined) {
                        // Final update with end position
                        const nodePos = this.node.pos;
                        const endNodeRelMouse = { 
                            x: endEvent.canvasX - nodePos[0], 
                            y: endEvent.canvasY - nodePos[1] 
                        };
                        this._updateBandValueFromMouse(endEvent, endNodeRelMouse);
                        this.activeBand = undefined;
                        this.node.setDirtyCanvas(true, true);
                    }
                };

                // Initial update on mouse down
                this._updateBandValueFromMouse(event, nodeRelMouse);
                this.node.setDirtyCanvas(true, true);
                return true; // Event handled
            }
        }
        return false; // Event not handled by a band point
    }

    _onMouseMoveSelf(event, nodeRelMouse, canvas) {
        const { pointer } = canvas;
        if (!pointer) return;

        const compRelMouse = this.getNodeRelMouseToCompRelMouse(nodeRelMouse);

        const bandCount = 7;
        const bandSpacing = this.width / (bandCount - 1);
        let hoveredBand = null;

        for (let i = 0; i < bandCount; i++) {
            const bandName = `band${i + 1}`;
            const bandValue = this.node.properties[bandName] || 0.0;
            const pointX = i * bandSpacing; // Relative to component's x
            const pointY = (this.height / 2) * (1 - bandValue); // Relative to component's y center

            const distSq = (compRelMouse.x - pointX) ** 2 + (compRelMouse.y - pointY) ** 2;
            // Check if mouse is within a small horizontal range of the band line
            if (distSq < (this.bandPointRadius*5) ** 2 && !this.isPointerInside(nodeRelMouse))  {
                hoveredBand = i + 1;
                break;
            }
        }

        if (hoveredBand !== null && this.highlightedBand !== hoveredBand) {
            this.highlightedBand = hoveredBand;
            this.node.setDirtyCanvas(true, true);
        } else if (hoveredBand === null && this.highlightedBand !== null) {
            this.highlightedBand = undefined;
            this.node.setDirtyCanvas(true, true);
        }
    }

    _onMouseUpSelf(event, nodeRelMouse, canvas) {
        // This might no longer be needed since pointer.onDragEnd handles it
        // Keep only if you need additional mouse up logic
        return false;
    }

    _updateBandValueFromMouse(event, nodeRelMouse) {
        if (this.activeBand === undefined) return;

        const compRelMouseY = nodeRelMouse.y - this.abs_y; // Mouse Y relative to this component's top edge

        let value = 1 - (2 * compRelMouseY) / this.height; // Value from -1 to 1
        value = Math.max(this.node.properties.min, Math.min(this.node.properties.max, value));

        const step = this.node.properties.step || 0.01;
        if (event.shiftKey) {
            // Coarse adjustment
            value = Math.round(value / 0.1) * 0.1;
        } else {
            // Fine adjustment
            value = Math.round(value / step) * step;
        }
        value = parseFloat(value.toFixed(2));

        const bandName = `band${this.activeBand}`;
        if (this.node.properties[bandName] !== value) {
            this.node.properties[bandName] = value;
            this.node.onPropertyChanged(bandName); // This will trigger SFE's onPropertyChanged
        }
    }
}
