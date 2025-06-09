import { BaseUIComponent } from "./base.js";

export class CheckboxComponent extends BaseUIComponent {
    constructor(parent, options = {}) {
        super(parent, options);
        this.text = options.text || "";
        this.checked = options.checked || false;
        this.onChange = options.onChange || function(checked) { console.log("Checkbox changed:", checked); };
        this.font = options.font || "10px Arial";
        this.textColor = options.textColor || (typeof LiteGraph !== "undefined" ? LiteGraph.NODE_TEXT_COLOR : "#FFFFFF");
        
        // Checkbox box styling
        this.boxSize = options.boxSize || 12;
        this.backgroundColor = options.backgroundColor || "rgba(80,80,80,0.8)";
        this.hoverColor = options.hoverColor || "rgba(100,100,100,0.9)";
        this.activeColor = options.activeColor || "rgba(120,120,120,1.0)";
        this.borderColor = options.borderColor || "rgba(150,150,150,0.8)";
        this.borderWidth = options.borderWidth || 1;
        this.cornerRadius = options.cornerRadius || 3;
        
        // Check mark styling
        this.checkColor = options.checkColor || "rgb(117, 207, 0)";
        this.checkPadding = options.checkPadding || 3;
        
        // Disabled styling
        this.disabled = options.disabled || false;
        this.disabledColor = options.disabledColor || "rgba(60,60,60,0.5)";
        this.disabledTextColor = options.disabledTextColor || "rgba(150,150,150,0.8)";
        this.disabledBorderColor = options.disabledBorderColor || "rgba(100,100,100,0.5)";
        this.disabledCheckColor = options.disabledCheckColor || "rgba(150,150,150,0.6)";
        
        // Spacing and sizing
        this.textPadding = options.textPadding || 4;
        this.isHovering = false;
        this.isActive = false;
        
        // Calculate dimensions
        this._calculateDimensions();
    }

    _calculateDimensions() {
        // Create a temporary canvas to measure text
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        ctx.font = this.font;
        
        const textWidth = this.text ? ctx.measureText(this.text).width : 0;
        const fontSize = parseInt(this.font.match(/\d+/)[0]);
        
        this.width = this.boxSize + (this.text ? this.textPadding + textWidth : 0);
        this.height = Math.max(this.boxSize, fontSize + 4);
    }

    _drawSelf(ctx) {
        // Determine current colors based on state
        let currentBackgroundColor = this.backgroundColor;
        let currentTextColor = this.textColor;
        let currentBorderColor = this.borderColor;
        let currentCheckColor = this.checkColor;
        
        if (this.disabled) {
            currentBackgroundColor = this.disabledColor;
            currentTextColor = this.disabledTextColor;
            currentBorderColor = this.disabledBorderColor;
            currentCheckColor = this.disabledCheckColor;
        } else if (this.isActive) {
            currentBackgroundColor = this.activeColor;
        } else if (this.isHovering) {
            currentBackgroundColor = this.hoverColor;
        }
        
        // Calculate checkbox position (vertically centered)
        const checkboxY = this.abs_y + (this.height - this.boxSize) / 2;
        
        // Draw checkbox background
        ctx.fillStyle = currentBackgroundColor;
        ctx.beginPath();
        ctx.roundRect(this.abs_x, checkboxY, this.boxSize, this.boxSize, this.cornerRadius);
        ctx.fill();
        
        // Draw checkbox border
        if (this.borderWidth > 0) {
            ctx.strokeStyle = currentBorderColor;
            ctx.lineWidth = this.borderWidth;
            ctx.beginPath();
            ctx.roundRect(this.abs_x, checkboxY, this.boxSize, this.boxSize, this.cornerRadius);
            ctx.stroke();
        }
        
        // Draw check mark if checked
        if (this.checked) {
            const checkSize = this.boxSize - (this.checkPadding * 2);
            const checkX = this.abs_x + this.checkPadding;
            const checkY = checkboxY + this.checkPadding;
            
            ctx.fillStyle = currentCheckColor;
            ctx.beginPath();
            ctx.roundRect(checkX, checkY, checkSize, checkSize, Math.max(0, this.cornerRadius - 1));
            ctx.fill();
        }
        
        // Draw text if provided
        if (this.text) {
            ctx.fillStyle = currentTextColor;
            ctx.font = this.font;
            ctx.textAlign = "left";
            
            const fontSize = parseInt(this.font.match(/\d+/)[0]);
            const textX = this.abs_x + this.boxSize + this.textPadding;
            const textY = this.abs_y + this.height / 2 + fontSize / 3.5;
            
            ctx.fillText(this.text, textX, textY);
        }
    }

    setChecked(checked) {
        if (this.checked !== checked) {
            this.checked = checked;
            if (this.node && this.node.setDirtyCanvas) {
                this.node.setDirtyCanvas(true, true);
            }
        }
    }
    
    setDisabled(disabled) {
        this.disabled = disabled;
        if (this.node && this.node.setDirtyCanvas) {
            this.node.setDirtyCanvas(true, true);
        }
    }
    
    setText(text) {
        this.text = text;
        this._calculateDimensions();
        if (this.node && this.node.setDirtyCanvas) {
            this.node.setDirtyCanvas(true, true);
        }
    }

    _onMouseDownSelf(event, nodeRelMouse, canvas) {
        const { pointer } = canvas;
        const compRelMouse = this.getNodeRelMouseToCompRelMouse(nodeRelMouse);
        
        if (this._isMouseOver(compRelMouse) && !this.disabled) {
            // Set up pointer callbacks
            pointer.onClick = (upEvent) => {
                // Handle regular click - convert canvas coordinates to node-relative
                const nodePos = this.node.pos;
                const upNodeRelMouse = { 
                    x: upEvent.canvasX - nodePos[0], 
                    y: upEvent.canvasY - nodePos[1] 
                };
                const upCompRelMouse = this.getNodeRelMouseToCompRelMouse(upNodeRelMouse);
                
                // Check if still over checkbox when click completes
                if (this._isMouseOver(upCompRelMouse) && !this.disabled) {
                    this.checked = !this.checked;
                    this.onChange(this.checked);
                }
                
                this.isActive = false;
                if (this.node && this.node.setDirtyCanvas) {
                    this.node.setDirtyCanvas(true, true);
                }
            };
            
            pointer.onDragStart = () => {
                // Initialize active state
                this.isActive = true;
                if (this.node && this.node.setDirtyCanvas) {
                    this.node.setDirtyCanvas(true, true);
                }
            };

            pointer.onDrag = (dragEvent) => {
                // Handle hover state during drag
                const nodePos = this.node.pos;
                const currentNodeRelMouse = { 
                    x: dragEvent.canvasX - nodePos[0], 
                    y: dragEvent.canvasY - nodePos[1] 
                };
                const currentCompRelMouse = this.getNodeRelMouseToCompRelMouse(currentNodeRelMouse);
                const isOver = this._isMouseOver(currentCompRelMouse);
                
                if (isOver !== this.isHovering) {
                    this.isHovering = isOver;
                    if (this.node && this.node.setDirtyCanvas) {
                        this.node.setDirtyCanvas(true, true);
                    }
                }
            };
            
            pointer.onDragEnd = (endEvent) => {
                // Clean up drag state
                const nodePos = this.node.pos;
                const endNodeRelMouse = { 
                    x: endEvent.canvasX - nodePos[0], 
                    y: endEvent.canvasY - nodePos[1] 
                };
                const endCompRelMouse = this.getNodeRelMouseToCompRelMouse(endNodeRelMouse);
                const wasActive = this.isActive;
                
                this.isActive = false;
                
                if (this.node && this.node.setDirtyCanvas) {
                    this.node.setDirtyCanvas(true, true);
                }
                
                // If mouse is still over checkbox when drag ends and it was active, toggle state
                if (wasActive && this._isMouseOver(endCompRelMouse) && !this.disabled) {
                    this.checked = !this.checked;
                    this.onChange(this.checked);
                }
            };
            
            // Set initial state
            this.isActive = true;
            if (this.node && this.node.setDirtyCanvas) {
                this.node.setDirtyCanvas(true, true);
            }
            
            return true; // Capture the event
        }
        return false;
    }

    _onMouseMoveSelf(event, nodeRelMouse, canvas) {
        // Handle hover state for non-dragging mouse movements
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

    _onMouseUpSelf(event, nodeRelMouse, canvas) {
        // This might no longer be needed since pointer handles click/drag end
        // Keep only if you need additional mouse up logic outside of pointer system
        return false;
    }

    _isMouseOver(compRelMouse) {
        return (
            compRelMouse.x >= 0 &&
            compRelMouse.x <= this.width &&
            compRelMouse.y >= 0 &&
            compRelMouse.y <= this.height
        );
    }
}