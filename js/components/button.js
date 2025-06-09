import { BaseUIComponent } from "./base.js";

export class ButtonComponent extends BaseUIComponent {
    constructor(parent, options = {}) {
        super(parent, options);
        this.text = options.text || "";
        this.onClick = options.onClick || function() { console.log("Button clicked (default)"); };
        this.font = options.font || "12px Arial";
        this.textColor = options.textColor || (typeof LiteGraph !== "undefined" ? LiteGraph.NODE_TEXT_COLOR : "#FFFFFF");
        this.backgroundColor = options.backgroundColor || "rgba(80,80,80,0.8)";
        this.hoverColor = options.hoverColor || "rgba(100,100,100,0.9)";
        this.activeColor = options.activeColor || "rgba(120,120,120,1.0)";
        this.cornerRadius = options.cornerRadius || 4;
        this.isHovering = false;
        this.isActive = false;
        this.disabled = options.disabled || false;
        this.disabledColor = options.disabledColor || "rgba(60,60,60,0.5)";
        this.disabledTextColor = options.disabledTextColor || "rgba(150,150,150,0.8)";
        this.width = options.width || 80;
        this.height = options.height || 24;
        
        // Icon properties
        this.iconPath = options.iconPath || null;
        this.iconSize = options.iconSize || 16;
        this.iconOnly = options.iconOnly || false;
        this.iconPosition = options.iconPosition || "left"; // "left", "right", "top", "bottom", "center"
        this.iconPadding = options.iconPadding || 5;
        this._iconImage = null;
        
        if (this.iconPath) {
            this._loadIcon();
        }
    }

    _loadIcon() {
        if (!this.iconPath) return;
        
        this._iconImage = new Image();
        this._iconImage.onerror = (e) => {
            console.warn(`Failed to load button icon: ${this.iconPath}`, e);
            this._iconImage = null; // Clear the broken image reference
            if (this.node && this.node.setDirtyCanvas) {
                this.node.setDirtyCanvas(true, true);
            }
        };
        this._iconImage.onload = () => {
            if (this.node && this.node.setDirtyCanvas) {
                this.node.setDirtyCanvas(true, true);
            }
        };
        this._iconImage.src = this.iconPath;
    }

    _drawSelf(ctx) {
        // Determine current background color based on state
        let currentBackgroundColor = this.backgroundColor;
        let currentTextColor = this.textColor;
        
        if (this.disabled) {
            currentBackgroundColor = this.disabledColor;
            currentTextColor = this.disabledTextColor;
        } else if (this.isActive) {
            currentBackgroundColor = this.activeColor;
        } else if (this.isHovering) {
            currentBackgroundColor = this.hoverColor;
        }
        
        // Draw button background
        ctx.fillStyle = currentBackgroundColor;
        ctx.beginPath();
        ctx.roundRect(this.abs_x, this.abs_y, this.width, this.height, this.cornerRadius);
        ctx.fill();
        
        // Check if we have a valid icon
        const hasIcon = this._iconImage && this._iconImage.complete && this._iconImage.naturalWidth > 0;
        const hasText = !this.iconOnly && this.text;
        
        // Calculate positions based on content
        let iconX, iconY, textX, textY;
        const fontSize = parseInt(this.font.match(/\d+/)[0]);
        
        if (hasIcon && hasText) {
            // Draw both icon and text
            if (this.iconPosition === "left") {
                iconX = this.abs_x + this.iconPadding;
                iconY = this.abs_y + (this.height - this.iconSize) / 2;
                textX = iconX + this.iconSize + this.iconPadding;
                textY = this.abs_y + this.height / 2 + fontSize / 3.5;
                ctx.textAlign = "left";
            } else if (this.iconPosition === "right") {
                textX = this.abs_x + this.iconPadding;
                textY = this.abs_y + this.height / 2 + fontSize / 3.5;
                iconX = this.abs_x + this.width - this.iconSize - this.iconPadding;
                iconY = this.abs_y + (this.height - this.iconSize) / 2;
                ctx.textAlign = "left";
            } else if (this.iconPosition === "top") {
                iconX = this.abs_x + (this.width - this.iconSize) / 2;
                iconY = this.abs_y + this.iconPadding;
                textX = this.abs_x + this.width / 2;
                textY = iconY + this.iconSize + this.iconPadding + fontSize / 2;
                ctx.textAlign = "center";
            } else if (this.iconPosition === "bottom") {
                textX = this.abs_x + this.width / 2;
                textY = this.abs_y + this.iconPadding + fontSize / 2;
                iconX = this.abs_x + (this.width - this.iconSize) / 2;
                iconY = textY + this.iconPadding;
                ctx.textAlign = "center";
            }
        } else if (hasIcon) {
            // Icon only
            iconX = this.abs_x + (this.width - this.iconSize) / 2;
            iconY = this.abs_y + (this.height - this.iconSize) / 2;
        } else if (hasText) {
            // Text only
            textX = this.abs_x + this.width / 2;
            textY = this.abs_y + this.height / 2 + fontSize / 3.5;
            ctx.textAlign = "center";
        }
        
        // Draw text if needed
        if (hasText) {
            ctx.fillStyle = currentTextColor;
            ctx.font = this.font;
            ctx.fillText(this.text, textX, textY);
        }
        
        // Draw icon if loaded
        if (hasIcon) {
            try {
                ctx.drawImage(this._iconImage, iconX, iconY, this.iconSize, this.iconSize);
            } catch (e) {
                console.warn("Failed to draw icon:", e);
                // Clear the broken image reference so we don't try to draw it again
                this._iconImage = null;
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
        if (this.node && this.node.setDirtyCanvas) {
            this.node.setDirtyCanvas(true, true);
        }
    }
    
    setIcon(iconPath) {
        if (this.iconPath === iconPath) return; // No change
        this.iconPath = iconPath;
        this._iconImage = null; // Clear the previous image
        if (iconPath) {
            this._loadIcon();
        }
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
                
                // Check if still over button when click completes
                if (this._isMouseOver(upCompRelMouse) && !this.disabled) {
                    this.onClick();
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
                
                // If mouse is still over button when drag ends and it was active, trigger click
                if (wasActive && this._isMouseOver(endCompRelMouse) && !this.disabled) {
                    this.onClick();
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

    // These methods can now be simplified or removed since pointer handles the state
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