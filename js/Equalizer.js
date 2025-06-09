import { app } from "../../scripts/app.js";
import { BaseUIComponent } from "./components/base.js";
import { CycleSelectorComponent } from "./components/cycle_selector.js";
import { EqualizerGraphComponent } from "./components/eq_graph.js";
import { MenuPopupComponent } from "./components/popup.js";

class SoundFlowEqualizer extends BaseUIComponent {
    constructor(node) {
        super(node, { width: 350, height: 430 });
        this.node = node;

        this.node.properties = this.node.properties || {};
        const defaultProps = { band1: 0.0, band2: 0.0, band3: 0.0, band4: 0.0, band5: 0.0, band6: 0.0, band7: 0.0, min: -1.0, max: 1.0, step: 0.01, currentPreset: "Custom" };
        Object.keys(defaultProps).forEach(key => { if (!(key in this.node.properties)) this.node.properties[key] = defaultProps[key]; });

        this.presets = {
            // Existing presets
            "Flat": { band1: 0.0, band2: 0.0, band3: 0.0, band4: 0.0, band5: 0.0, band6: 0.0, band7: 0.0 },
            "Rock": { band1: 0.5, band2: 0.4, band3: 0.0, band4: 0.3, band5: 0.4, band6: 0.5, band7: 0.4 },
            "Pop": { band1: 0.2, band2: 0.1, band3: -0.1, band4: 0.4, band5: 0.5, band6: 0.4, band7: 0.3 },
            "Dance/EDM": { band1: 0.8, band2: 0.6, band3: -0.4, band4: -0.2, band5: 0.4, band6: 0.6, band7: 0.8 },
            "Hip Hop/Rap": { band1: 0.7, band2: 0.5, band3: -0.2, band4: 0.3, band5: 0.4, band6: 0.5, band7: 0.2 },
            "Country": { band1: 0.2, band2: 0.3, band3: 0.0, band4: 0.4, band5: 0.4, band6: 0.3, band7: 0.2 },
            "Jazz": { band1: 0.1, band2: 0.3, band3: 0.2, band4: 0.2, band5: 0.1, band6: 0.2, band7: 0.0 },
            "Classical": { band1: 0.1, band2: 0.2, band3: 0.1, band4: 0.0, band5: 0.1, band6: 0.2, band7: 0.1 },
            "Bass Boost": { band1: 0.8, band2: 0.6, band3: 0.2, band4: 0.0, band5: -0.2, band6: -0.2, band7: -0.4 },
            "Treble Boost": { band1: -0.4, band2: -0.2, band3: -0.2, band4: 0.0, band5: 0.2, band6: 0.6, band7: 0.8 },
            "Vocal Boost": { band1: -0.2, band2: -0.1, band3: 0.0, band4: 0.5, band5: 0.6, band6: 0.2, band7: 0.0 },
            "Acoustic": { band1: 0.3, band2: 0.2, band3: 0.0, band4: -0.2, band5: 0.0, band6: 0.4, band7: 0.3 },
            "R&B": { band1: 0.6, band2: 0.4, band3: -0.1, band4: -0.3, band5: 0.0, band6: 0.3, band7: 0.4 },
            "Metal": { band1: 0.6, band2: 0.5, band3: 0.2, band4: 0.0, band5: 0.3, band6: 0.6, band7: 0.5 },
            "Lofi": { band1: 0.5, band2: 0.3, band3: -0.2, band4: -0.3, band5: -0.2, band6: -0.1, band7: -0.4 },
            "Gaming": { band1: 0.5, band2: 0.3, band3: 0.0, band4: 0.2, band5: 0.5, band6: 0.7, band7: 0.6 },
            "Cinema": { band1: 0.4, band2: 0.3, band3: 0.2, band4: 0.2, band5: 0.3, band6: 0.4, band7: 0.5 },
            "Night Mode": { band1: -0.3, band2: -0.2, band3: -0.1, band4: 0.0, band5: -0.1, band6: -0.2, band7: -0.5 },
            "Clarity": { band1: -0.5, band2: -0.3, band3: 0.0, band4: 0.5, band5: 0.7, band6: 0.6, band7: 0.3 },
            "Vintage": { band1: 0.5, band2: 0.3, band3: 0.0, band4: -0.3, band5: -0.5, band6: 0.0, band7: 0.2 },
            "Vocal Clarity": { band1: -0.6, band2: -0.4, band3: -0.2, band4: 0.6, band5: 0.8, band6: 0.4, band7: -0.2 },
            "Loudness": { band1: 0.6, band2: 0.5, band3: 0.4, band4: 0.3, band5: 0.4, band6: 0.5, band7: 0.6 },
            "Live Concert": { band1: 0.4, band2: 0.5, band3: 0.3, band4: 0.0, band5: 0.3, band6: 0.5, band7: 0.6 },
            "Orchestral": { band1: 0.3, band2: 0.4, band3: 0.5, band4: 0.3, band5: 0.2, band6: 0.3, band7: 0.2 },
            "Outdoor": { band1: 0.2, band2: 0.3, band3: 0.4, band4: 0.2, band5: 0.1, band6: 0.0, band7: -0.1 }
        };

        this.presetNames = ["Custom", ...Object.keys(this.presets)];

        this.sideMargin = 30;
        this.eqGraphHeight = 150;
        this.bandLabelAreaHeight = 15;
        this.presetSelectorHeight = 25;
        this.spacingBelowGraph = 5;
        this.spacingBelowSelector = 10;

        // Instantiate EqualizerGraphComponent
        this.eqGraph = new EqualizerGraphComponent(this, {
            // Options for EqualizerGraphComponent could be passed here if needed
        });
        this.addChild(this.eqGraph);

        // Instantiate CycleSelectorComponent
        this.presetSelector = new CycleSelectorComponent(this, {
            items: this.presetNames,
            initialValue: this.node.properties.currentPreset,
            onClick: (value) => {
                this.menuPopup.visible = !this.menuPopup.visible;
            },
            onChange: (newValue) => {
                this.node.properties.currentPreset = newValue;
                this.applyPreset(newValue);
                this.node.setDirtyCanvas(true, true);
            },
            height: this.presetSelectorHeight,
            arrowZoneWidth: 30
        });
        this.addChild(this.presetSelector);

        this.menuPopup = new MenuPopupComponent(node, {
            visible: false,
            items: [...this.presetNames, /* ... many items ... */],
            maxVisibleItems: 6,
            width: 180,
            x: 100,
            y: 350,
            onSelect: (value, index) => {
                this.applyPreset(value);
                this.node.properties.currentPreset = value;
                this.presetSelector.setValue(value, true);
                this.menuPopup.visible = false;
                this.node.setDirtyCanvas(true, true);
                // Close popup or handle selection
            },
            onClose: () => {
                this.menuPopup.visible = false;
                // Handle popup close
            }
        });
        this.addChild(this.menuPopup);

        this.setupNodeHandlers();
        this.initializeWidgetListeners();
    }

    updateLayout(parentAbsX = 0, parentAbsY = 0) {
        const nodeInputHeight = this.node.inputs ? this.node.inputs.length * LiteGraph.NODE_SLOT_HEIGHT : 0;
        const nodeOutputHeight = this.node.outputs ? this.node.outputs.length * LiteGraph.NODE_SLOT_HEIGHT : 0;
        const titleHeight = Math.max(20, LiteGraph.NODE_TITLE_HEIGHT);
        let currentY = Math.max(nodeInputHeight, nodeOutputHeight) + titleHeight + 5;
        this.height = this.node.height - titleHeight;
        this.width = this.node.width;

        const availableWidth = this.width - (this.sideMargin * 2);

        this.eqGraph.x = this.sideMargin;
        this.eqGraph.y = currentY;
        this.eqGraph.width = availableWidth;
        this.eqGraph.height = this.eqGraphHeight;

        currentY += this.eqGraphHeight + this.bandLabelAreaHeight + this.spacingBelowGraph;

        this.presetSelector.x = this.sideMargin;
        this.presetSelector.y = currentY;
        this.presetSelector.width = availableWidth;

        
        this.menuPopup.width = availableWidth * 0.8;
        this.menuPopup.x = this.presetSelector.x + this.presetSelector.width / 2 - this.menuPopup.width / 2;
        this.menuPopup.y = this.presetSelector.y - this.menuPopup.height;

        super.updateLayout(parentAbsX, parentAbsY);
    }

    initializeWidgetListeners() {
        setTimeout(() => {
            if (this.node.widgets) {
                for (const widget of this.node.widgets) {
                    if (widget.name && this.node.properties.hasOwnProperty(widget.name) && !widget._sf_listener) {
                        widget.callback = (value) => {
                            this.node.properties[widget.name] = value;
                            this.node.properties.currentPreset = "Custom";
                            this.presetSelector.setValue("Custom", true);
                            this.node.onPropertyChanged?.(widget.name);
                        };
                        widget._sf_listener = true;
                    }
                }
            }
        }, 0);
    }

    setupNodeHandlers() {
        const self = this;

        this.node.onPropertyChanged = function (propName) {
            if (propName?.startsWith("band")) {
                if (this.properties.currentPreset !== "Custom") {
                    this.properties.currentPreset = "Custom";
                    self.presetSelector.setValue("Custom", true);
                }
            }
            for (let i = 1; i <= 7; i++) {
                const widget = this.widgets?.find(w => w.name === `band${i}`);
                if (widget && widget.value !== this.properties[`band${i}`]) {
                    widget.value = this.properties[`band${i}`];
                }
            }
            this.setDirtyCanvas(true, true);
        };

        this.node.onDrawForeground = function (ctx) {
            if (this.flags.collapsed) return;
            self.updateLayout();
            for (const child of self.children) {
                child.draw(ctx);
            }
        };
    }

    applyPreset(presetName) {
        const preset = this.presets[presetName];
        if (!preset) { console.warn(`SFE: No preset '${presetName}'`); return; }
        let changed = false;
        for (let i = 1; i <= 7; i++) { const bandName = `band${i}`; if (this.node.properties[bandName] !== preset[bandName]) { this.node.properties[bandName] = preset[bandName]; changed = true; } }
        if (changed) this.node.onPropertyChanged();
    }

}

app.registerExtension({
    name: "SoundFlow.Equalizer",
    async beforeRegisterNodeDef(nodeType, nodeData, _app) {
        if (nodeData.name === "SoundFlow_Equalizer") {
            nodeType.prototype.computeSize = function () { return [350, 450]; }

            const originalOnNodeCreated = nodeType.prototype.onNodeCreated;
            nodeType.prototype.onNodeCreated = function () {
                originalOnNodeCreated?.apply(this, arguments);
                if (!this.SoundFlowEqualizer) {
                    this.SoundFlowEqualizer = new SoundFlowEqualizer(this);
                }
                this.size = this.computeSize();
                this.setDirtyCanvas(true, true);
            };

            nodeType.prototype.onMouseDown = function (e, canvasPos, canvas) {
                if (this.SoundFlowEqualizer) {
                    // Convert to node-relative mouse
                    const nodeRelMouse = { x: e.canvasX - this.pos[0], y: e.canvasY - this.pos[1] };
                    return this.SoundFlowEqualizer.onMouseDown(e, nodeRelMouse, canvas);
                }
            };
            nodeType.prototype.onMouseMove = function (e, canvasPos, canvas) {
                if (this.SoundFlowEqualizer) {
                    const nodeRelMouse = { x: e.canvasX - this.pos[0], y: e.canvasY - this.pos[1] };
                    return this.SoundFlowEqualizer.onMouseMove(e, nodeRelMouse, canvas);
                }
            };
            nodeType.prototype.onMouseUp = function (e, canvasPos, canvas) {
                if (this.SoundFlowEqualizer) {
                    const nodeRelMouse = { x: e.canvasX - this.pos[0], y: e.canvasY - this.pos[1] };
                    return this.SoundFlowEqualizer.onMouseUp(e, nodeRelMouse, canvas);
                }
            };
        }
    }
});