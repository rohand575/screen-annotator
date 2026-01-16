/**
 * Screen Annotator - Drawing Engine
 * Handles rectangle, arrow, and text annotations over any screen content
 */

// ============================================================================
// TAURI API IMPORTS
// ============================================================================
const { invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;

// ============================================================================
// CONFIGURATION
// ============================================================================
const CONFIG = {
    colors: {
        rectangle: '#ff3366',      // Vibrant red-pink for rectangles
        arrow: '#00ccff',          // Cyan for arrows
        text: '#ffcc00',           // Yellow for text background
    },
    stroke: {
        rectangleWidth: 4,
        arrowWidth: 4,
        arrowHeadSize: 20,
    }
};

// ============================================================================
// STATE MANAGEMENT
// ============================================================================
const state = {
    // Current tool: 'rectangle' | 'arrow' | 'text'
    currentTool: 'rectangle',
    
    // Drawing state
    isDrawing: false,
    startX: 0,
    startY: 0,
    
    // Store all drawn shapes for redraw
    shapes: [],
    
    // Store text elements separately (DOM elements)
    textElements: [],
};

// ============================================================================
// CANVAS SETUP
// ============================================================================
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const toolNameEl = document.getElementById('tool-name');
const textContainer = document.getElementById('text-container');

/**
 * Resize canvas to fill screen with proper DPI scaling
 */
function resizeCanvas() {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = window.innerWidth * dpr;
    canvas.height = window.innerHeight * dpr;
    canvas.style.width = window.innerWidth + 'px';
    canvas.style.height = window.innerHeight + 'px';
    ctx.scale(dpr, dpr);
    
    // Redraw all shapes after resize
    redrawAllShapes();
}

/**
 * Clear the canvas (transparent)
 */
function clearCanvas() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
}

/**
 * Redraw all stored shapes
 */
function redrawAllShapes() {
    clearCanvas();
    state.shapes.forEach(shape => {
        if (shape.type === 'rectangle') {
            drawRectangle(shape.x1, shape.y1, shape.x2, shape.y2, false);
        } else if (shape.type === 'arrow') {
            drawArrow(shape.x1, shape.y1, shape.x2, shape.y2, false);
        }
    });
}

// ============================================================================
// DRAWING FUNCTIONS
// ============================================================================

/**
 * Draw a rectangle (stroke only, no fill)
 */
function drawRectangle(x1, y1, x2, y2, isPreview = true) {
    ctx.strokeStyle = CONFIG.colors.rectangle;
    ctx.lineWidth = CONFIG.stroke.rectangleWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    const x = Math.min(x1, x2);
    const y = Math.min(y1, y2);
    const w = Math.abs(x2 - x1);
    const h = Math.abs(y2 - y1);
    
    // Add subtle shadow for visibility
    ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
    ctx.shadowBlur = 4;
    ctx.shadowOffsetX = 2;
    ctx.shadowOffsetY = 2;
    
    ctx.strokeRect(x, y, w, h);
    
    // Reset shadow
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
}

/**
 * Draw an arrow with arrowhead
 */
function drawArrow(x1, y1, x2, y2, isPreview = true) {
    const headSize = CONFIG.stroke.arrowHeadSize;
    
    ctx.strokeStyle = CONFIG.colors.arrow;
    ctx.fillStyle = CONFIG.colors.arrow;
    ctx.lineWidth = CONFIG.stroke.arrowWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    // Add shadow
    ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
    ctx.shadowBlur = 4;
    ctx.shadowOffsetX = 2;
    ctx.shadowOffsetY = 2;
    
    // Calculate angle
    const angle = Math.atan2(y2 - y1, x2 - x1);
    
    // Draw line (stop short of arrowhead)
    const lineEndX = x2 - headSize * Math.cos(angle) * 0.5;
    const lineEndY = y2 - headSize * Math.sin(angle) * 0.5;
    
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(lineEndX, lineEndY);
    ctx.stroke();
    
    // Draw arrowhead
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(
        x2 - headSize * Math.cos(angle - Math.PI / 6),
        y2 - headSize * Math.sin(angle - Math.PI / 6)
    );
    ctx.lineTo(
        x2 - headSize * Math.cos(angle + Math.PI / 6),
        y2 - headSize * Math.sin(angle + Math.PI / 6)
    );
    ctx.closePath();
    ctx.fill();
    
    // Reset shadow
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
}

/**
 * Create a floating text box at position
 */
function createTextBox(x, y) {
    console.log('createTextBox called with x:', x, 'y:', y);
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'floating-text';
    input.style.left = x + 'px';
    input.style.top = y + 'px';
    input.placeholder = 'Type here...';

    console.log('Input element created:', input);

    // Store reference
    state.textElements.push(input);

    // Add to container
    console.log('Text container:', textContainer);
    textContainer.appendChild(input);
    console.log('Input appended to container');

    // Focus immediately with a small delay to ensure rendering
    setTimeout(() => {
        input.focus();
        console.log('Input focused, activeElement:', document.activeElement);
    }, 10);

    // Handle Enter to blur (finish editing)
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            input.blur();
        }
        // Don't let Escape propagate if we're editing
        if (e.key === 'Escape' && input.value.trim() === '') {
            // If empty on escape, remove the text box
            input.remove();
            const idx = state.textElements.indexOf(input);
            if (idx > -1) state.textElements.splice(idx, 1);
        }
        // Prevent keyboard shortcuts while typing
        e.stopPropagation();
    });

    // Remove empty text boxes on blur
    input.addEventListener('blur', () => {
        if (input.value.trim() === '') {
            input.remove();
            const idx = state.textElements.indexOf(input);
            if (idx > -1) state.textElements.splice(idx, 1);
        }
    });
}

// ============================================================================
// TOOL MANAGEMENT
// ============================================================================

/**
 * Set the current tool and update UI
 */
function setTool(tool) {
    state.currentTool = tool;
    
    // Update tool indicator
    const toolNames = {
        'rectangle': 'RECTANGLE',
        'arrow': 'ARROW',
        'text': 'TEXT'
    };
    toolNameEl.textContent = toolNames[tool] || tool.toUpperCase();
    
    // Update body class for cursor
    document.body.className = tool + '-mode';
}

// ============================================================================
// CLEAR ALL ANNOTATIONS
// ============================================================================

/**
 * Clear everything and hide overlay
 */
async function clearAndHide() {
    // Clear canvas
    clearCanvas();
    state.shapes = [];
    
    // Remove all text elements
    state.textElements.forEach(el => el.remove());
    state.textElements = [];
    
    // Hide the overlay window
    await invoke('hide_overlay');
}

/**
 * Clear everything but stay in overlay mode
 */
function clearAll() {
    clearCanvas();
    state.shapes = [];
    state.textElements.forEach(el => el.remove());
    state.textElements = [];
}

// ============================================================================
// EVENT HANDLERS
// ============================================================================

// --- Mouse Events ---

canvas.addEventListener('mousedown', (e) => {
    console.log('Mouse down - current tool:', state.currentTool);
    if (state.currentTool === 'text') {
        // In text mode, click creates a text box
        console.log('Creating text box at', e.clientX, e.clientY);
        createTextBox(e.clientX, e.clientY);
        return;
    }

    // Start drawing rectangle or arrow
    state.isDrawing = true;
    state.startX = e.clientX;
    state.startY = e.clientY;
});

canvas.addEventListener('mousemove', (e) => {
    if (!state.isDrawing) return;
    
    // Redraw all existing shapes
    redrawAllShapes();
    
    // Draw preview of current shape
    if (state.currentTool === 'rectangle') {
        drawRectangle(state.startX, state.startY, e.clientX, e.clientY, true);
    } else if (state.currentTool === 'arrow') {
        drawArrow(state.startX, state.startY, e.clientX, e.clientY, true);
    }
});

canvas.addEventListener('mouseup', (e) => {
    if (!state.isDrawing) return;
    state.isDrawing = false;
    
    // Save the shape
    const shape = {
        type: state.currentTool,
        x1: state.startX,
        y1: state.startY,
        x2: e.clientX,
        y2: e.clientY
    };
    
    // Only save if shape has some size
    const minSize = 5;
    if (Math.abs(shape.x2 - shape.x1) > minSize || Math.abs(shape.y2 - shape.y1) > minSize) {
        state.shapes.push(shape);
    }
    
    // Final redraw
    redrawAllShapes();
});

// Cancel drawing if mouse leaves canvas while drawing
canvas.addEventListener('mouseleave', () => {
    if (state.isDrawing) {
        state.isDrawing = false;
        redrawAllShapes();
    }
});

// --- Keyboard Events ---

document.addEventListener('keydown', (e) => {
    // Don't process if typing in a text input
    if (e.target.classList.contains('floating-text')) {
        return;
    }

    console.log('Key pressed:', e.key, 'Current tool:', state.currentTool);

    switch (e.key.toLowerCase()) {
        case 'r':
            setTool('rectangle');
            break;
        case 'a':
            setTool('arrow');
            break;
        case 't':
            console.log('Setting tool to text');
            setTool('text');
            break;
        case 'escape':
            clearAndHide();
            break;
        case 'c':
            // C to clear but stay in overlay mode
            if (e.ctrlKey || e.metaKey) {
                // Don't override system Ctrl+C
                return;
            }
            clearAll();
            break;
    }
});

// --- Window Events ---

window.addEventListener('resize', resizeCanvas);

// --- Tauri Events ---

// Listen for overlay shown event to reset state
listen('overlay-shown', () => {
    // Reset to rectangle mode when overlay opens
    setTool('rectangle');
    resizeCanvas();
});

// Listen for overlay hidden event
listen('overlay-hidden', () => {
    // Clear everything when hidden
    clearAll();
});

// ============================================================================
// INITIALIZATION
// ============================================================================

function init() {
    // Initial canvas setup
    resizeCanvas();
    
    // Set default tool
    setTool('rectangle');
    
    console.log('Screen Annotator initialized');
    console.log('Shortcuts: R=Rectangle, A=Arrow, T=Text, ESC=Clear & Hide, C=Clear');
}

// Start when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
