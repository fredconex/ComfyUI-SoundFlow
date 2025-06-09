import { app } from "../../scripts/app.js";
import { SliderComponent } from "./components/slider.js";
import { BaseUIComponent } from "./components/base.js";

class SoundFlowGainPitchControl extends BaseUIComponent {
    constructor(node) {
        super(node, { width: 250, height: 300 });
        this.node = node;
        this.node.properties = this.node.properties || {};
        const defaultProps = {
            gain: 0.0,
            pitch: 0.0,
            min_gain: -24.0,
            max_gain: 24.0,
            min_pitch: -12.0,
            max_pitch: 12.0,
            step: 0.01,
        };
        for (const key in defaultProps) if (!(key in this.node.properties)) this.node.properties[key] = defaultProps[key];

        this.padding = 10;
        this.colors = {
            background: "rgba(20,20,20,0.8)",
            text: typeof LiteGraph !== "undefined" ? LiteGraph.NODE_TEXT_COLOR : "#FFFFFF",
        };

        const sharedSliderWidth = 32;
        const sharedSliderHeight = 260;

        this.gainSlider = new SliderComponent(this, {
            width: sharedSliderWidth,
            height: sharedSliderHeight,
            label: "GAIN",
            value: this.node.properties.gain,
            min: this.node.properties.min_gain,
            max: this.node.properties.max_gain,
            step: this.node.properties.step,
            color: "rgb(122, 156, 0)",
            unit: "dB",
            precision: 1,
            tickCount: 5,
            tickAlignment: "left",
            magneticTicks: true,
            onChange: (value) => {
                if (this.node.properties.gain !== value) {
                    this.node.properties.gain = value;
                    this.node.onPropertyChanged?.("gain");
                }
            },
        });
        this.addChild(this.gainSlider);

        this.pitchSlider = new SliderComponent(this, {
            width: sharedSliderWidth,
            height: sharedSliderHeight,
            label: "PITCH",
            value: this.node.properties.pitch,
            min: this.node.properties.min_pitch,
            max: this.node.properties.max_pitch,
            step: this.node.properties.step,
            color: "rgb(122, 156, 0)",
            unit: "st",
            precision: 1,
            tickCount: 5,
            tickAlignment: "right",
            magneticTicks: true,
            onChange: (value) => {
                if (this.node.properties.pitch !== value) {
                    this.node.properties.pitch = value;
                    this.node.onPropertyChanged?.("pitch");
                }
            },
        });
        this.addChild(this.pitchSlider);

        this.setupNodeHandlers();
        this.initializeWidgetListeners();
    }

    updateLayout(parentAbsX = 0, parentAbsY = 0) {
        const nodeInputHeight = this.node.inputs ? this.node.inputs.length * LiteGraph.NODE_SLOT_HEIGHT : 0;
        const nodeOutputHeight = this.node.outputs ? this.node.outputs.length * LiteGraph.NODE_SLOT_HEIGHT : 0;
        const titleHeight = Math.max(20, typeof LiteGraph !== "undefined" ? LiteGraph.NODE_TITLE_HEIGHT : 22);
        let currentY = Math.max(nodeInputHeight, nodeOutputHeight) + titleHeight + 5;
        this.height = this.node.height - titleHeight;
        this.width = this.node.width;

        this.headerTextY = currentY + 10;
        currentY += 25;
        this.panelY = currentY;
        const sliderYPos = this.panelY + this.padding;
        const availableWidthForSliders = this.width - this.padding * 2;
        const gapBetweenSliders = 20;
        const totalSlidersWidth = this.gainSlider.width * 2 + gapBetweenSliders;
        const sliderStartX = this.padding + (availableWidthForSliders - totalSlidersWidth) / 2;

        this.gainSlider.x = sliderStartX;
        this.gainSlider.y = sliderYPos;
        this.pitchSlider.x = sliderStartX + this.gainSlider.width + gapBetweenSliders;
        this.pitchSlider.y = sliderYPos;

        const gainTickLabels = [];
        for (let i = 0; i < this.gainSlider.sliderOptions.tickCount; i++) {
            const val = this.node.properties.max_gain - i * ((this.node.properties.max_gain - this.node.properties.min_gain) / (this.gainSlider.sliderOptions.tickCount - 1));
            gainTickLabels.push(`${val.toFixed(0)}dB`);
        }
        this.gainSlider.sliderOptions.tickLabels = gainTickLabels;
        const pitchTickLabels = [];
        for (let i = 0; i < this.pitchSlider.sliderOptions.tickCount; i++) {
            const val = this.node.properties.max_pitch - i * ((this.node.properties.max_pitch - this.node.properties.min_pitch) / (this.pitchSlider.sliderOptions.tickCount - 1));
            pitchTickLabels.push(`${val.toFixed(0)}st`);
        }
        this.pitchSlider.sliderOptions.tickLabels = pitchTickLabels;

        const sliderTrackHeight = this.gainSlider.height;
        const sliderLabelSpace = this.gainSlider.labelHeight * 2;
        this.panelHeight = sliderTrackHeight + sliderLabelSpace + this.padding * 2;

        super.updateLayout(parentAbsX, parentAbsY);
    }

    initializeWidgetListeners() {
        setTimeout(() => {
            if (this.node.widgets) {
                for (const widget of this.node.widgets) {
                    if (widget.name && this.node.properties.hasOwnProperty(widget.name) && !widget._sf_listener) {
                        widget.callback = (value) => {
                            if (this.node.properties[widget.name] !== value) {
                                this.node.properties[widget.name] = value;
                                this.node.onPropertyChanged?.(widget.name);
                            }
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
            let sliderToUpdate = null;
            if (propName === "gain") sliderToUpdate = self.gainSlider;
            else if (propName === "pitch") sliderToUpdate = self.pitchSlider;

            if (sliderToUpdate) {
                if (sliderToUpdate.sliderOptions.value !== this.properties[propName]) {
                    sliderToUpdate.setValue(this.properties[propName], true);
                }
            }
            const widget = this.widgets?.find((w) => w.name === propName);
            if (widget && widget.value !== this.properties[propName]) widget.value = this.properties[propName];
            this.setDirtyCanvas(true, true);
        };

        this.node.onDrawForeground = function (ctx) {
            if (this.flags.collapsed) return;
            self.updateLayout();
            ctx.fillStyle = self.colors.text;
            ctx.font = "bold 14px Arial";
            ctx.textAlign = "center";
            ctx.fillText("Audio Control", this.size[0] / 2, self.headerTextY);
            const panelX = self.padding;
            const gradient = ctx.createLinearGradient(0, self.panelY, 0, self.panelY + self.panelHeight);
            gradient.addColorStop(0, "rgba(10,10,10,0.85)");
            gradient.addColorStop(0.8, "rgba(20,20,20,0.8)");
            gradient.addColorStop(1, "rgba(25,25,25,0.75)");
            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.roundRect(panelX, self.panelY, this.size[0] - self.padding * 2, self.panelHeight, 6);
            ctx.fill();
            self.draw(ctx);
        };
    }
}

app.registerExtension({
    name: "SoundFlow.GainPitchControl",
    async beforeRegisterNodeDef(nodeType, nodeData, _app) {
        if (nodeData.name === "SoundFlow_GainPitchControl") {
            nodeType.prototype.computeSize = () => [250, 450];
            const oONC = nodeType.prototype.onNodeCreated;
            nodeType.prototype.onNodeCreated = function () {
                oONC?.apply(this, arguments);
                if (!this.SoundFlowGainPitchControl) this.SoundFlowGainPitchControl = new SoundFlowGainPitchControl(this);
                this.size = this.computeSize();
                this.setDirtyCanvas(true, true);
            };

            nodeType.prototype.onMouseDown = function (e, canvasPos, canvas) {
                if (this.SoundFlowGainPitchControl) {
                    // Convert to node-relative mouse
                    const nodeRelMouse = { x: e.canvasX - this.pos[0], y: e.canvasY - this.pos[1] };
                    return this.SoundFlowGainPitchControl.onMouseDown(e, nodeRelMouse, canvas);
                }
            };
            nodeType.prototype.onMouseMove = function (e, canvasPos, canvas) {
                if (this.SoundFlowGainPitchControl) {
                    const nodeRelMouse = { x: e.canvasX - this.pos[0], y: e.canvasY - this.pos[1] };
                    return this.SoundFlowGainPitchControl.onMouseMove(e, nodeRelMouse, canvas);
                }
            };
            nodeType.prototype.onMouseUp = function (e, canvasPos, canvas) {
                if (this.SoundFlowGainPitchControl) {
                    const nodeRelMouse = { x: e.canvasX - this.pos[0], y: e.canvasY - this.pos[1] };
                    return this.SoundFlowGainPitchControl.onMouseUp(e, nodeRelMouse, canvas);
                }
            };
        }
    },
});
