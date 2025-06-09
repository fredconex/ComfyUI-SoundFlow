import { BaseUIComponent } from "./base.js";

export class MenuPopupComponent extends BaseUIComponent {
    constructor(parent, options) {
        super(parent, options);
        this.items = options.items || [];
        this.selectedIndex = options.selectedIndex || 0;
        this.maxVisibleItems = options.maxVisibleItems || 8;
        this.itemHeight = options.itemHeight || 24;
        this.scrollbarWidth = options.scrollbarWidth || 12;
        this.padding = options.padding || 8;
        
        // Callbacks
        this.onSelect = options.onSelect || function(value, index) {
            console.log("Menu item selected:", value, index);
        };
        this.onClose = options.onClose || function() {
            console.log("Menu closed");
        };
        
        // Styling - matching CycleSelectorComponent
        this.font = options.font || "12px Arial";
        this.textColor = options.textColor || LiteGraph.NODE_TEXT_COLOR;
        this.backgroundColor = options.backgroundColor || "rgba(20,20,20,0.9)";
        this.selectedColor = options.selectedColor || "rgba(100,100,100,0.6)";
        this.hoverColor = options.hoverColor || "rgba(60,60,60,0.6)";
        this.scrollbarColor = options.scrollbarColor || "rgba(150,150,150,0.8)";
        this.scrollbarTrackColor = options.scrollbarTrackColor || "rgba(80,80,80,0.8)";
        this.borderColor = options.borderColor || "rgba(100,100,100,0.8)";
        
        // Scrolling state
        this.scrollOffset = 0;
        this.maxScrollOffset = Math.max(0, this.items.length - this.maxVisibleItems);
        this.hoveredIndex = -1;
        this.isDraggingScrollbar = false;
        this.scrollbarDragStart = 0;
        this.scrollOffsetDragStart = 0;
        
        // Calculate dimensions
        this.visibleItems = Math.min(this.items.length, this.maxVisibleItems);
        this.contentHeight = this.visibleItems * this.itemHeight;
        this.needsScrollbar = this.items.length > this.maxVisibleItems;
        
        // Set component dimensions
        this.width = options.width || 200;
        this.height = this.contentHeight + (this.padding * 2);
        
        // Position popup (can be overridden)
        this.abs_x = options.x || 0;
        this.abs_y = options.y || 0;
    }
    
    setPosition(x, y) {
        this.abs_x = x;
        this.abs_y = y;
    }
    
    getScrollbarRect() {
        if (!this.needsScrollbar) return null;

        const trackHeight = this.contentHeight;
        const thumbHeight = Math.max(20, (this.visibleItems / this.items.length) * trackHeight);
        const maxOffset = Math.max(this.maxScrollOffset, 1); // Prevent division by zero
        const thumbPosition = (this.scrollOffset / maxOffset) * (trackHeight - thumbHeight);

        return {
            trackX: this.abs_x + this.width - this.scrollbarWidth - this.padding,
            trackY: this.abs_y + this.padding,
            trackWidth: this.scrollbarWidth,
            trackHeight: trackHeight,
            thumbX: this.abs_x + this.width - this.scrollbarWidth - this.padding,
            thumbY: this.abs_y + this.padding + thumbPosition,
            thumbWidth: this.scrollbarWidth,
            thumbHeight: thumbHeight
        };
    }

    
    scrollTo(offset) {
        this.maxScrollOffset = Math.max(0, this.items.length - this.maxVisibleItems);
        this.scrollOffset = Math.max(0, Math.min(this.maxScrollOffset, offset));
        if (this.node && this.node.setDirtyCanvas) this.node.setDirtyCanvas(true, true);
    }

    
    scrollBy(delta) {
        this.scrollTo(this.scrollOffset + delta);
    }
    
    getItemIndexAtPosition(y) {
        const relativeY = y - (this.abs_y + this.padding);
        if (relativeY < 0 || relativeY > this.contentHeight) return -1;
        
        const itemIndex = Math.floor(relativeY / this.itemHeight) + this.scrollOffset;
        return itemIndex < this.items.length ? itemIndex : -1;
    }
    
    _drawSelf(ctx) {
        ctx.save();
        // Draw main background with border
        ctx.fillStyle = this.backgroundColor;
        ctx.strokeStyle = this.borderColor;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(this.abs_x, this.abs_y, this.width, this.height, 4);
        ctx.fill();
        ctx.stroke();
        
        // Set clipping area for items
        ctx.beginPath();
        ctx.rect(this.abs_x + this.padding, this.abs_y + this.padding, 
                this.width - this.padding * 2 - (this.needsScrollbar ? this.scrollbarWidth + 4 : 0), 
                this.contentHeight);
        ctx.clip();
        
        // Draw items
        ctx.font = this.font;
        ctx.textAlign = "left";
        
        for (let i = 0; i < this.visibleItems; i++) {
            const itemIndex = i + this.scrollOffset;
            if (itemIndex >= this.items.length) break;
            
            const itemY = this.abs_y + this.padding + (i * this.itemHeight);
            const item = this.items[itemIndex];
            
            // Draw item background
            if (itemIndex === this.selectedIndex) {
                ctx.fillStyle = this.selectedColor;
                ctx.fillRect(this.abs_x + this.padding, itemY, 
                           this.width - this.padding * 2 - (this.needsScrollbar ? this.scrollbarWidth + 4 : 0), 
                           this.itemHeight);
            } else if (itemIndex === this.hoveredIndex) {
                ctx.fillStyle = this.hoverColor;
                ctx.fillRect(this.abs_x + this.padding, itemY, 
                           this.width - this.padding * 2 - (this.needsScrollbar ? this.scrollbarWidth + 4 : 0), 
                           this.itemHeight);
            }
            
            // Draw item text
            ctx.fillStyle = this.textColor;
            const textY = itemY + this.itemHeight / 2 + parseInt(this.font.match(/\d+/)[0]) / 3.5;
            ctx.fillText(item, this.abs_x + this.padding + 4, textY);
        }
        
        ctx.restore();
        
        // Draw scrollbar if needed
        if (this.needsScrollbar) {
            const scrollbar = this.getScrollbarRect();
            
            // Draw scrollbar track
            ctx.fillStyle = this.scrollbarTrackColor;
            ctx.beginPath();
            ctx.roundRect(scrollbar.trackX, scrollbar.trackY, scrollbar.trackWidth, scrollbar.trackHeight, 2);
            ctx.fill();
            
            // Draw scrollbar thumb
            ctx.fillStyle = this.scrollbarColor;
            ctx.beginPath();
            ctx.roundRect(scrollbar.thumbX, scrollbar.thumbY, scrollbar.thumbWidth, scrollbar.thumbHeight, 2);
            ctx.fill();
        }

    }
    
    _onMouseDownSelf(event, nodeRelMouse, canvas) {
        const { pointer } = canvas;
        const compRelMouse = this.getNodeRelMouseToCompRelMouse(nodeRelMouse);
        
        // Check if mouse is within component bounds
        if (compRelMouse.x < 0 || compRelMouse.x > this.width || 
            compRelMouse.y < 0 || compRelMouse.y > this.height) {
            // Click outside - close popup
            this.onClose();
            return false;
        }
        
        // Check scrollbar interaction (convert to absolute coordinates for scrollbar checks)
        const absoluteMouseX = this.abs_x + compRelMouse.x;
        const absoluteMouseY = this.abs_y + compRelMouse.y;
        
        if (this.needsScrollbar) {
            const scrollbar = this.getScrollbarRect();
            if (absoluteMouseX >= scrollbar.trackX && absoluteMouseX <= scrollbar.trackX + scrollbar.trackWidth &&
                absoluteMouseY >= scrollbar.trackY && absoluteMouseY <= scrollbar.trackY + scrollbar.trackHeight) {
                
                // Check if clicking on thumb
                if (absoluteMouseY >= scrollbar.thumbY && absoluteMouseY <= scrollbar.thumbY + scrollbar.thumbHeight) {
                    this.isDraggingScrollbar = true;
                    this.scrollbarDragStart = absoluteMouseY;
                    this.scrollOffsetDragStart = this.scrollOffset;
                } else {
                    // Click on track - jump to position
                    const trackRatio = (absoluteMouseY - scrollbar.trackY) / scrollbar.trackHeight;
                    const newOffset = Math.round(trackRatio * this.maxScrollOffset);
                    this.scrollTo(newOffset);
                }
                
                pointer.onDrag = (dragEvent) => {
                    if (this.isDraggingScrollbar) {
                        const deltaY = dragEvent.canvasY - this.scrollbarDragStart - this.node.pos[1];
                        const scrollbar = this.getScrollbarRect();
                        const trackRange = scrollbar.trackHeight - scrollbar.thumbHeight;

                        const scrollRatio = trackRange > 0 ? deltaY / trackRange : 0;
                        const newOffset = this.scrollOffsetDragStart + (scrollRatio * this.maxScrollOffset);

                        this.scrollTo(Math.round(newOffset));
                    }
                };

                
                pointer.onDragEnd = () => {
                    this.isDraggingScrollbar = false;
                };
                
                return true;
            }
        }
        
        // Handle item selection
        const itemIndex = this.getItemIndexAtPosition(absoluteMouseY);
        if (itemIndex >= 0) {
            pointer.onClick = () => {
                this.selectedIndex = itemIndex;
                this.onSelect(this.items[itemIndex], itemIndex);
                if (this.node && this.node.setDirtyCanvas) this.node.setDirtyCanvas(true, true);
            };
            
            return true;
        }
        
        return true; // Consume the event even if no specific action
    }
    
    _onMouseMoveSelf(event, nodeRelMouse, canvas) {
        const compRelMouse = this.getNodeRelMouseToCompRelMouse(nodeRelMouse);
        
        // Check if mouse is within component bounds
        if (compRelMouse.x >= 0 && compRelMouse.x <= this.width && 
            compRelMouse.y >= 0 && compRelMouse.y <= this.height) {
            
            const absoluteMouseY = this.abs_y + compRelMouse.y;
            const newHoveredIndex = this.getItemIndexAtPosition(absoluteMouseY);
            
            if (newHoveredIndex !== this.hoveredIndex) {
                this.hoveredIndex = newHoveredIndex;
                if (this.node && this.node.setDirtyCanvas) this.node.setDirtyCanvas(true, true);
            }
            
            return true;
        } else {
            // Mouse is outside - clear hover
            if (this.hoveredIndex !== -1) {
                this.hoveredIndex = -1;
                if (this.node && this.node.setDirtyCanvas) this.node.setDirtyCanvas(true, true);
            }
            return false;
        }
    }
}