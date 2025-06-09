import { app } from "../../scripts/app.js";
import { api } from '../../../scripts/api.js'
import { BaseUIComponent } from "./components/base.js";
import { SliderComponent } from "./components/slider.js";
import { ButtonComponent } from "./components/button.js";
import { WaveformComponent } from "./components/waveform.js";
import { CheckboxComponent } from "./components/checkbox.js";



// Icons
const playIcon = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABgAAAAYCAYAAADgdz34AAAAAXNSR0IArs4c6QAAAGtJREFUSEvtk8ENACEIBKUQaj2tlUI8ffjxwy4JiZfTN+zgEKQkP0nOLxfgGv6RIjN7VLW5TrYCWNEA9NFbWQgLmPNRkAiAgkQBMORYALyHyA/g8OmRBVDhLCD30NgLXvWwoguIGnD7vr+DF05ZMBkmxjnCAAAAAElFTkSuQmCC"
const pauseIcon = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABgAAAAYCAYAAADgdz34AAAAAXNSR0IArs4c6QAAAFlJREFUSEtjZKAxYKSx+QyjFhAMYaxB9Pjx4//YdMrKyoLVE5JH1juwFqC7mFg+0T4g1kBYkMHUj1oAT0W4gnA0iEaDiHBZM/jLIoJlMAkKRms0goFF8yACAH4JwBmNEmHBAAAAAElFTkSuQmCC"
const stopIcon = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABgAAAAYCAYAAADgdz34AAAAAXNSR0IArs4c6QAAAFpJREFUSEtjZKAxYKSx+QyjFhAM4YELosePH/8n6DwkBbKyslgdi9MHdLMAl8tgjoc5hGwfjFpAMJJHg2jgg4jY3Ex2PqCZBcQaTEjdwJWmhFxGrPyoDwiGFADCJ1AZMYB6ngAAAABJRU5ErkJggg=="
const downloadIcon = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABgAAAAYCAYAAADgdz34AAAAAXNSR0IArs4c6QAAAOhJREFUSEvtlLENwjAQRS+S17CCO0rYAMpsAxMEJoBtoGMFOspDchagt2xs5Eghie2TpYiCpHJx91/+950LmPgrJtaHPwNIKY2LlHNOdk4udMIzIDmxk0SEiCshxH3sDhBxIYR4xv4seslN05yMMTsAqDjn164DRNwwxm5W/GCn6hiCRAFWsHYCvrkCgIs7K6W2Xhy01vuyLM9ZAB9LF/KlkxJ3xaQ96Dn5QCjiZEDfCVV8FBAbRefEir/GMg/1DSLKmfXYM/I7QHKtAwX9l3bgABGXjLFHDkAptW63vu0njWkObAaQU3sDcw2CGegBJvgAAAAASUVORK5CYII="

class SoundFlowPreviewAudio extends BaseUIComponent {
    constructor(node) {
        super(node, { width: 250, height: 300 });
        this.node = node;
        this.node.properties = {
            autoSeek: false,
            duration: 0,
            audioUrl: '',
            isPlaying: false,
            currentTime: 0,
            volume: 1.0,
            node_id: null,
        };

        this.padding = 10;
        this.colors = {
            background: "rgba(20,20,20,0.8)",
            text: typeof LiteGraph !== "undefined" ? LiteGraph.NODE_TEXT_COLOR : "#FFFFFF",
        };

        this.waveformviewer = new WaveformComponent(this, {
            x: 15,
            y: 30,
            width: 200,
            height: 100,
            onChange: (progress) => {
                this.node.properties.currentTime = progress * this.node.properties.duration;
                if (this.audioElement) this.audioElement.currentTime = this.node.properties.currentTime;
            },
        })
        this.addChild(this.waveformviewer);

        this.volumeSlider = new SliderComponent(this, {
            height: 260,
            width: 24,
            label: "VOLUME",
            labelVisible: false,
            value: 1.0,
            min: 0.0,
            max: 1.0,
            step: 0.01,
            color: "rgb(122, 156, 0)",
            unit: "dB",
            precision: 100,
            tickCount: 3,
            tickLabels: ["100%", "50%", "0%"],
            tickAlignment: "right",
            magneticTicks: true,
            onChange: (value) => {
                if (this.node.properties.volume !== value) {
                    this.node.properties.volume = value;
                    this.audioElement.volume = value;
                    this.node.onPropertyChanged?.("volume");
                }
            },
        });
        this.addChild(this.volumeSlider);

        // Creating a play button with an icon
        this.playButton = new ButtonComponent(this, {
            text: "",
            iconPath: playIcon,
            iconPosition: "left",
            iconSize: 24,
            width: 32,
            height: 32,
            onClick: () => {
                if (this.audioElement && this.audioElement.isPlaying) {
                    this.pauseAudio();
                } else {
                    this.playAudio();
                }
            }
        });

        // Creating a stop button with an icon
        this.stopButton = new ButtonComponent(this, {
            text: "",
            iconPath: stopIcon,
            iconPosition: "left",
            iconSize: 24,
            width: 32,
            height: 32,
            onClick: () => {
                this.stopAudio();
            }
        });

        // Add Buttons
        this.addChild(this.playButton);
        this.addChild(this.stopButton);

        // Creating a stop button with an icon
        this.autoSeek = new CheckboxComponent(this, {
            x: 100,
            y: 50,
            text: "Auto Seek",
            checked: this.node.properties.autoSeek,
            onChange: (value) => {
                this.node.properties.autoSeek = value;
            }
        });

        this.addChild(this.autoSeek);

        //  Set up node handlers
        this.setupNodeHandlers();

        // Initialize widget listeners
        this.initializeWidgetListeners();
    }

    destroy() {
        this.cleanup();
        super.destroy?.();
    }

    cleanup() {
        // Stop and cleanup audio
        if (this.audioElement) {
            try {
                this.removeAudioListeners();
                this.audioElement.pause();
                this.audioElement.removeAttribute('src');
                this.audioElement.load();
            } catch (e) {
                console.warn('Error cleaning up audio element:', e);
            }
            this.audioElement = null;
        }

        // Reset properties
        if (this.node.properties) {
            this.node.properties.isPlaying = false;
            this.node.properties.currentTime = 0;
            this.node.properties.duration = 0;
            this.node.properties.audioUrl = '';
        }

        // Reset UI
        if (this.playButton) {
            this.waveformviewer.progress = 0;
            this.waveformviewer.clearWaveform();
            this.playButton.setIcon(playIcon);
        }
    }

    playAudio(){
        this.audioElement = new Audio();
        this.setupAudioListeners();
        this.audioElement.volume = this.node.properties.volume;

        this.playButton.setIcon(pauseIcon);
        if (this.audioElement.src !== this.node.properties.audioUrl) {
            this.audioElement.src = this.node.properties.audioUrl;
        }
        this.audioElement.currentTime = this.node.properties.currentTime;
        this.audioElement.play();
        this.audioElement.isPlaying = true;
    }

    pauseAudio(){
        this.playButton.setIcon(playIcon);
        this.node.properties.currentTime = this.audioElement.currentTime;

        // Remove event listeners, if any
        this.removeAudioListeners();

        // Stop and release audio element
        if (this.audioElement) {
            this.audioElement.pause();
            this.audioElement.removeAttribute('src'); // Remove source
            this.audioElement.load(); // Force unload
            this.audioElement = null;
        }
    }

    stopAudio(){
        // Remove event listeners, if any
        this.removeAudioListeners();

        // Stop and release audio element
        if (this.audioElement) {
            this.audioElement.pause();
            this.audioElement.removeAttribute('src'); // Remove source
            this.audioElement.load(); // Force unload
            this.audioElement = null;
        }

        // Handle stop functionality
        this.node.properties.currentTime = 0;
        this.waveformviewer.progress = 0;
        this.playButton.setIcon(playIcon);
    }

    updateLayout(parentAbsX = 0, parentAbsY = 0) {
        const nodeInputHeight = this.node.inputs ? this.node.inputs.length * LiteGraph.NODE_SLOT_HEIGHT : 0;
        const nodeOutputHeight = this.node.outputs ? this.node.outputs.length * LiteGraph.NODE_SLOT_HEIGHT : 0;
        const titleHeight = Math.max(20, LiteGraph.NODE_TITLE_HEIGHT);
        let currentY = Math.max(nodeInputHeight, nodeOutputHeight) + 5;

        this.height = this.node.height - titleHeight;
        this.width = this.node.width;

        this.headerTextY = currentY - 5;
        this.panelY = currentY;
        this.panelHeight = this.node.height - this.panelY * 2 - 48;

        this.waveformviewer.x = 25;
        this.waveformviewer.y = 30;
        this.waveformviewer.width = this.node.width - 96 - 25;
        this.waveformviewer.height = this.panelHeight - 25;


        // Right align the slider with padding from the right edge
        this.volumeSlider.x = this.width - this.volumeSlider.width - 42;
        this.volumeSlider.y = this.panelY;
        this.volumeSlider.height = this.panelHeight;

        // Play Button
        this.playButton.x = 10;
        this.playButton.y = this.panelY + this.panelHeight + 5;

        // Stop Button
        this.stopButton.x = 45;
        this.stopButton.y = this.panelY + this.panelHeight + 5;

        // Auto Seek
        this.autoSeek.x = 80;
        this.autoSeek.y = this.panelY + this.panelHeight + 14;

        const displayControls = (this.node.properties.duration > 0);
        this.playButton.visible = displayControls;
        this.stopButton.visible = displayControls;
        this.autoSeek.visible = displayControls;

        super.updateLayout(parentAbsX, parentAbsY);
    }
    
    removeAudioListeners() {
        if (this._timeUpdateHandler) {
            this.audioElement.removeEventListener('timeupdate', this._timeUpdateHandler);
        }
        if (this._ended) {
            this.audioElement.removeEventListener('ended', this._ended);
        }

        if (this._errorHandler){
            this.audioElement.removeEventListener('error', this._errorHandler);
        }
    }

    setupAudioListeners() {
        // Remove any existing listeners first
        this.removeAudioListeners();

        // Create bound event handlers
        this._ended = () => {
            this.stopAudio();
        }

         this._errorHandler = (e) => {
            console.error('Audio error:', e);
            if (!this.isDestroyed) {
                this.stopAudio();
            }
        };

        this._timeUpdateHandler = () => {
            if (this.audioElement.isPlaying) {
                // Update node properties
                this.node.properties.currentTime = this.audioElement.currentTime;
                this.node.properties.isPlaying = this.audioElement.isPlaying;
                this.waveformviewer.progress = this.audioElement.currentTime / this.audioElement.duration;

                // Force graph update
                if (this.node.graph) this.node.graph._version++;
                this.node.setDirtyCanvas(true, true);
            }
        };
        this.audioElement.addEventListener('ended', this._ended);
        this.audioElement.addEventListener('timeupdate', this._timeUpdateHandler);
        this.audioElement.addEventListener('error', this._errorHandler);
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
            if (propName === "volume" && self.volumeSlider) {
                if (self.volumeSlider.sliderOptions.value !== this.properties[propName]) {
                    self.volumeSlider.setValue(this.properties[propName], true);
                }
            }

            // Add this block to handle autoSeek property restoration
            if (propName === "autoSeek" && self.autoSeek) {
                self.autoSeek.setChecked(this.properties[propName]);
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
            //ctx.fillText(`Audio Preview`, this.size[0] / 2, self.headerTextY);
            const panelX = self.padding;
            const gradient = ctx.createLinearGradient(0, self.panelY, 0, self.panelY + self.panelHeight);
            gradient.addColorStop(0, "rgba(10,10,10,0.85)");
            gradient.addColorStop(1, "rgba(25,25,25,0.75)");
            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.roundRect(panelX, self.panelY, this.size[0] - 87, self.panelHeight, 6);
            ctx.fill();
            self.draw(ctx);
        };
    }
}

// Convert file to URL for access
const parseUrl = data => {
    if (!data || !data.filename) {
        return { url: "", waveformData: null, duration: 0, prompt: "", node_id: "" };
    }

    try {
        let { filename, subfolder, type, waveform_data, prompt, node_id } = data;

        const url = api.apiURL(
            `/view?filename=${encodeURIComponent(filename)}&type=${type || "audio"}&subfolder=${subfolder || ""}${app.getPreviewFormatParam()}${app.getRandParam()}`
        );

        // Parse waveform data if available
        let waveformData = null;
        let duration = 0;
        if (waveform_data) {
            try {
                const jsonData = JSON.parse(atob(waveform_data));
                waveformData = jsonData.waveform;
                duration = jsonData.duration;
            } catch (error) {
                console.error("Failed to parse waveform data:", error);
            }
        }

        return {
            url,
            waveformData,
            duration,
            prompt: prompt || "",
            node_id: node_id || ""
        };
    } catch (error) {
        console.error("Error parsing URL:", error);
        return { url: "", waveformData: null, duration: 0, prompt: "", node_id: "" };
    }
};

app.registerExtension({
    name: "SoundFlow.PreviewAudio",
    async beforeRegisterNodeDef(nodeType, nodeData, _app) {
        if (nodeData.name === "SoundFlow_PreviewAudio") {
            nodeType.prototype.computeSize = () => [250, 150];
            const oONC = nodeType.prototype.onNodeCreated;
            nodeType.prototype.onNodeCreated = function () {
                oONC?.apply(this, arguments);
                if (!this.SoundFlowPreviewAudio) this.SoundFlowPreviewAudio = new SoundFlowPreviewAudio(this);
                this.size = this.computeSize();
                this.setDirtyCanvas(true, true);
            };

            const onExecuted = nodeType.prototype.onExecuted;
            nodeType.prototype.onExecuted = function (message) {
                onExecuted?.apply(this, arguments);
                if (!message.audio || !message.audio.length) return;

                try {
                    let { url, waveformData, duration, prompt, node_id } = parseUrl(message.audio[0]);

                    // Store the node_id
                    this.properties.node_id = node_id;
                    this.properties.audioUrl = url;
                    this.properties.duration = duration;

                    this.SoundFlowPreviewAudio.waveformviewer.loadWaveform(waveformData, duration);
                    if (this.SoundFlowPreviewAudio.audioElement) {
                        if (this.SoundFlowPreviewAudio.audioElement.isPlaying && this.SoundFlowPreviewAudio.autoSeek.checked) {
                            const oldProgress = this.SoundFlowPreviewAudio.audioElement.currentTime / this.SoundFlowPreviewAudio.audioElement.duration;
                            this.SoundFlowPreviewAudio.audioElement.pause();
                            if (this.SoundFlowPreviewAudio.audioElement.src !== url) {
                                this.SoundFlowPreviewAudio.audioElement.src = url;
                            }
                            this.SoundFlowPreviewAudio.audioElement.play();

                            const seekTime = parseFloat(oldProgress * duration);
                            this.SoundFlowPreviewAudio.audioElement.currentTime = seekTime;
                        } else {
                            this.SoundFlowPreviewAudio.stopAudio();
                        }
                    }

                } catch (error) {
                    console.error('SoundFlow_PreviewAudio error:', error);
                }
            };

            nodeType.prototype.onMouseDown = function (e, canvasPos, canvas) {
                if (this.SoundFlowPreviewAudio) {
                    // Convert to node-relative mouse
                    const nodeRelMouse = { x: e.canvasX - this.pos[0], y: e.canvasY - this.pos[1] };
                    return this.SoundFlowPreviewAudio.onMouseDown(e, nodeRelMouse, canvas);
                }
            };
            nodeType.prototype.onMouseMove = function (e, canvasPos, canvas) {
                if (this.SoundFlowPreviewAudio) {
                    const nodeRelMouse = { x: e.canvasX - this.pos[0], y: e.canvasY - this.pos[1] };
                    return this.SoundFlowPreviewAudio.onMouseMove(e, nodeRelMouse, canvas);
                }
            };
            nodeType.prototype.onMouseUp = function (e, canvasPos, canvas) {
                if (this.SoundFlowPreviewAudio) {
                    const nodeRelMouse = { x: e.canvasX - this.pos[0], y: e.canvasY - this.pos[1] };
                    return this.SoundFlowPreviewAudio.onMouseUp(e, nodeRelMouse, canvas);
                }
            };

            // Add cleanup on removal
            const originalOnRemoved = nodeType.prototype.onRemoved;
            nodeType.prototype.onRemoved = function () {
                if (this.SoundFlowPreviewAudio) {
                    this.SoundFlowPreviewAudio.destroy();
                    this.SoundFlowPreviewAudio = null;
                }
                
                if (originalOnRemoved) {
                    originalOnRemoved.call(this);
                }
            };
        }
    },
    async loadedGraphNode(node, app) {
        if (node.type === 'SoundFlow_PreviewAudio') {
            try {
                // Clean up any existing audio state
                if (node.SoundFlowPreviewAudio) {
                    node.SoundFlowPreviewAudio.cleanup();
                }

                // Reset play button icon
                if (node.SoundFlowPreviewAudio?.playButton) {
                    node.SoundFlowPreviewAudio.playButton.setIcon(playIcon);
                }

                // Mark the node as dirty to ensure it redraws
                node.setDirtyCanvas?.(true, true);
            } catch (error) {
                console.error('Error in loadedGraphNode:', error);
            }
        }
    }
});