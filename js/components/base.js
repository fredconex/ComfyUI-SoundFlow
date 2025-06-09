export class BaseUIComponent {
    constructor(parent, options = {}) {
        this.parent = parent;
        this.canvas = parent.canvas;
        this.node = parent.node || parent;

        this.children = [];

        this.x = options.x || 0;
        this.y = options.y || 0;
        this.width = options.width || 100;
        this.height = options.height || 100;

        this.abs_x = 0;
        this.abs_y = 0;

        this.visible = options.visible !== undefined ? options.visible : true;
        this.enabled = options.enabled !== undefined ? options.enabled : true;

        this.id = options.id || null;
    }

    addChild(component) {
        component.parent = this;
        component.node = this.node;
        this.children.push(component);
        return component;
    }

    removeChild(component) {
        const index = this.children.indexOf(component);
        if (index > -1) {
            this.children.splice(index, 1);
            component.parent = null;
        }
    }

    updateLayout(parentAbsX = 0, parentAbsY = 0) {
        if (!this.visible) return;
        this.abs_x = parentAbsX + this.x;
        this.abs_y = parentAbsY + this.y;
        this.children.forEach(child => child.updateLayout(this.abs_x, this.abs_y));
    }

    _drawSelf(ctx) {
        // Draw hit area for debugging
        //ctx.strokeStyle = 'red';
        //ctx.strokeRect(this.abs_x, this.abs_y, this.width, this.height);
        
        /* Subclasses implement this */
    }

    draw(ctx) {
        if (!this.visible) return;
        this._drawSelf(ctx);
        for (const child of this.children) {
            child.draw(ctx);
        }
    }

    isPointerInside(nodeRelMouseX, nodeRelMouseY) {
        if (!this.visible || !this.enabled) return false;
        return nodeRelMouseX >= this.abs_x && nodeRelMouseX <= this.abs_x + this.width && nodeRelMouseY >= this.abs_y && nodeRelMouseY <= this.abs_y + this.height;
    }


    onMouseDown(event, nodeRelMouse, canvas) {
        if (!this.visible || !this.enabled || !this.isPointerInside(nodeRelMouse.x, nodeRelMouse.y)) {
            return false;
        }
        for (let i = this.children.length - 1; i >= 0; i--) {
            if (this.children[i].onMouseDown(event, nodeRelMouse, canvas)) {
                return true;
            }
        }
        return this._onMouseDownSelf(event, nodeRelMouse, canvas);
    }

    _onMouseDownSelf(event, nodeRelMouse, canvas) {
        return false;
    }

    onMouseMove(event, nodeRelMouse, canvas) {
        if (!this.visible) return false;
        let handledByChild = false;
        for (let i = this.children.length - 1; i >= 0; i--) {
            if (this.children[i].onMouseMove(event, nodeRelMouse, canvas)) {
                handledByChild = true;
            }
        }
        const handledBySelf = this._onMouseMoveSelf(event, nodeRelMouse, canvas);
        return handledByChild || handledBySelf;
    }

    _onMouseMoveSelf(event, nodeRelMouse) {
        return false;
    }

    onMouseUp(event, nodeRelMouse, canvas) {
        if (!this.visible || !this.enabled) return false;
        let handledByChild = false;
        for (let i = this.children.length - 1; i >= 0; i--) {
            if (this.children[i].onMouseUp(event, nodeRelMouse, canvas)) {
                handledByChild = true;
            }
        }
        const handledBySelf = this._onMouseUpSelf(event, nodeRelMouse, canvas);
        return handledByChild || handledBySelf;
    }

    _onMouseUpSelf(event, nodeRelMouse, canvas) {
        return false;
    }
    
    getNodeRelMouseToCompRelMouse(nodeRelMouse) {
        return {
            x: nodeRelMouse.x - this.abs_x,
            y: nodeRelMouse.y - this.abs_y,
        };
    }
}
