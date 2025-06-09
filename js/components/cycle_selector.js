import { BaseUIComponent } from "./base.js";

export class CycleSelectorComponent extends BaseUIComponent {
    constructor(parent, options) {
        super(parent, options);
        this.items = options.items || [];
        this.value = options.initialValue || (this.items.length > 0 ? this.items[0] : "");
        this.onClick = options.onClick || null;
        this.onChange = options.onChange || null;
        this.font = options.font || "12px Arial";
        this.textColor = options.textColor || LiteGraph.NODE_TEXT_COLOR;
        this.backgroundColor = options.backgroundColor || "rgba(20,20,20,0.8)";
        this.arrowColor = options.arrowColor || "rgba(150,150,150,0.8)";
        this.arrowZoneWidth = options.arrowZoneWidth || 25;
    }

    setValue(newValue, preventCallback = false) {
        const newIndex = this.items.indexOf(newValue);
        if (newIndex > -1 && this.value !== newValue) {
            this.value = newValue;
            if (!preventCallback) {
                this.onChange(this.value);
            }
            if (this.node && this.node.setDirtyCanvas) this.node.setDirtyCanvas(true, true);
        }
    }

    cycleNext() {
        if (this.items.length === 0) return;
        const currentIndex = this.items.indexOf(this.value);
        const newIndex = currentIndex < this.items.length - 1 ? currentIndex + 1 : 0;
        this.setValue(this.items[newIndex]);
    }

    cyclePrevious() {
        if (this.items.length === 0) return;
        const currentIndex = this.items.indexOf(this.value);
        const newIndex = currentIndex > 0 ? currentIndex - 1 : this.items.length - 1;
        this.setValue(this.items[newIndex]);
    }

    _drawSelf(ctx) {
        ctx.save();
        ctx.fillStyle = this.backgroundColor;
        ctx.beginPath();
        ctx.roundRect(this.abs_x, this.abs_y, this.width, this.height, 4);
        ctx.fill();
        const arrowPadding = 10;
        const arrowSize = 5;
        ctx.fillStyle = this.arrowColor;
        ctx.beginPath();
        ctx.moveTo(this.abs_x + this.arrowZoneWidth - arrowPadding, this.abs_y + this.height / 2 + arrowSize);
        ctx.lineTo(this.abs_x + this.arrowZoneWidth - arrowPadding - arrowSize, this.abs_y + this.height / 2);
        ctx.lineTo(this.abs_x + this.arrowZoneWidth - arrowPadding, this.abs_y + this.height / 2 - arrowSize);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(this.abs_x + this.width - this.arrowZoneWidth + arrowPadding, this.abs_y + this.height / 2 + arrowSize);
        ctx.lineTo(this.abs_x + this.width - this.arrowZoneWidth + arrowPadding + arrowSize, this.abs_y + this.height / 2);
        ctx.lineTo(this.abs_x + this.width - this.arrowZoneWidth + arrowPadding, this.abs_y + this.height / 2 - arrowSize);
        ctx.fill();
        ctx.fillStyle = this.textColor;
        ctx.font = this.font;
        ctx.textAlign = "center";
        const textX = this.abs_x + this.width / 2;
        const textY = this.abs_y + this.height / 2 + parseInt(this.font.match(/\d+/)[0]) / 3.5; // Slightly better baseline guess
        ctx.fillText(this.value, textX, textY);
        ctx.restore();
    }

    _onMouseDownSelf(event, nodeRelMouse, canvas) {
        const { pointer } = canvas;
        const compRelMouse = this.getNodeRelMouseToCompRelMouse(nodeRelMouse);
        
        if (compRelMouse.x >= 0 && compRelMouse.x <= this.width && compRelMouse.y >= 0 && compRelMouse.y <= this.height) {
            // Set up pointer callbacks
            pointer.onClick = (upEvent) => {
                // Handle click - convert canvas coordinates to node-relative
                const nodePos = this.node.pos;
                const upNodeRelMouse = { 
                    x: upEvent.canvasX - nodePos[0], 
                    y: upEvent.canvasY - nodePos[1] 
                };
                const upCompRelMouse = this.getNodeRelMouseToCompRelMouse(upNodeRelMouse);

                // Check which zone the click ended in
                if (upCompRelMouse.x >= 0 && upCompRelMouse.x < this.arrowZoneWidth && 
                    upCompRelMouse.y >= 0 && upCompRelMouse.y <= this.height) {
                    this.cyclePrevious();
                    return
                } else if (upCompRelMouse.x > this.width - this.arrowZoneWidth && upCompRelMouse.x <= this.width &&
                        upCompRelMouse.y >= 0 && upCompRelMouse.y <= this.height) {
                    this.cycleNext();
                    return
                }

                if (this.onClick) {
                    this.onClick(this.value);
                }

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
