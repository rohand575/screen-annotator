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
        text: '#ffffff',           // White for text background
        draw: '#00ff88',           // Bright green for freehand drawing
    },
    stroke: {
        rectangleWidth: 4,
        arrowWidth: 4,
        arrowHeadSize: 20,
        drawWidth: 3,
    }
};

// ============================================================================
// STATE MANAGEMENT
// ============================================================================
const state = {
    // Current tool: 'rectangle' | 'arrow' | 'text' | 'draw'
    currentTool: 'rectangle',

    // Drawing state
    isDrawing: false,
    startX: 0,
    startY: 0,

    // Store all drawn shapes for redraw
    shapes: [],

    // Store text elements separately (DOM elements)
    textElements: [],

    // In-progress freehand draw path (array of {x, y} points)
    currentDrawPath: [],
};

// ============================================================================
// CANVAS SETUP
// ============================================================================
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const textContainer = document.getElementById('text-container');

/**
 * Resize canvas to fill screen with proper DPI scaling
 */
function resizeCanvas() {
    resetCanvas();
    // Redraw all shapes after resize
    redrawAllShapes();
}

/**
 * Clear the canvas (transparent) - forces complete reset
 */
function clearCanvas() {
    // Reset transform first
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    // Clear with raw canvas dimensions
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // Re-apply DPR scaling
    const dpr = window.devicePixelRatio || 1;
    ctx.scale(dpr, dpr);
}

/**
 * Force complete canvas reset by reassigning dimensions
 * This is the nuclear option that guarantees clearing
 */
function resetCanvas() {
    const dpr = window.devicePixelRatio || 1;
    // Reassigning width clears ALL canvas content and resets context
    canvas.width = window.innerWidth * dpr;
    canvas.height = window.innerHeight * dpr;
    canvas.style.width = window.innerWidth + 'px';
    canvas.style.height = window.innerHeight + 'px';
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
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
        } else if (shape.type === 'draw') {
            drawFreePath(shape.points, false);
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
 * Draw a freehand path through an array of {x, y} points
 */
function drawFreePath(points, isPreview = true) {
    if (points.length < 2) return;

    ctx.strokeStyle = CONFIG.colors.draw;
    ctx.lineWidth = CONFIG.stroke.drawWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
    ctx.shadowBlur = 3;
    ctx.shadowOffsetX = 1;
    ctx.shadowOffsetY = 1;

    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
        ctx.lineTo(points[i].x, points[i].y);
    }
    ctx.stroke();

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
    input.style.width = '30px';

    // Hidden mirror span used to measure text width for auto-resize
    const mirror = document.createElement('span');
    mirror.style.cssText = [
        'position:absolute',
        'visibility:hidden',
        'white-space:pre',
        'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif',
        'font-size:18px',
        'font-weight:600',
        'padding:8px 12px',
        'left:-9999px',
        'top:-9999px',
    ].join(';');
    document.body.appendChild(mirror);

    function resizeInput() {
        mirror.textContent = input.value;
        const w = Math.max(30, mirror.offsetWidth + 6);
        input.style.width = w + 'px';
    }

    input.addEventListener('input', resizeInput);

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
            mirror.remove();
            input.remove();
            const idx = state.textElements.indexOf(input);
            if (idx > -1) state.textElements.splice(idx, 1);
        }
        // Prevent keyboard shortcuts while typing
        e.stopPropagation();
    });

    // Remove empty text boxes on blur
    input.addEventListener('blur', () => {
        mirror.remove();
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
    document.body.className = tool + '-mode';
    invoke('broadcast_tool', { tool });
}

function applyTool(tool) {
    state.currentTool = tool;
    document.body.className = tool + '-mode';
}

// ============================================================================
// CLEAR ALL ANNOTATIONS
// ============================================================================

/**
 * Toggle pause state - ESC toggles between Active and Paused.
 * Active -> Paused: annotations stay visible, window becomes click-through
 * Paused -> Active: resume drawing
 */
async function togglePause() {
    // Blur any active text input
    if (document.activeElement && document.activeElement.classList.contains('floating-text')) {
        document.activeElement.blur();
    }
    
    // Tell backend to toggle pause state
    await invoke('toggle_pause_cmd');
}

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
        console.log('Creating text box at', e.clientX, e.clientY);
        createTextBox(e.clientX, e.clientY);
        return;
    }

    if (state.currentTool === 'draw') {
        state.isDrawing = true;
        state.currentDrawPath = [{ x: e.clientX, y: e.clientY }];
        return;
    }

    // Start drawing rectangle or arrow
    state.isDrawing = true;
    state.startX = e.clientX;
    state.startY = e.clientY;
});

canvas.addEventListener('mousemove', (e) => {
    if (!state.isDrawing) return;

    if (state.currentTool === 'draw') {
        state.currentDrawPath.push({ x: e.clientX, y: e.clientY });
        redrawAllShapes();
        drawFreePath(state.currentDrawPath, true);
        return;
    }

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

    if (state.currentTool === 'draw') {
        if (state.currentDrawPath.length > 1) {
            state.shapes.push({ type: 'draw', points: state.currentDrawPath });
        }
        state.currentDrawPath = [];
        redrawAllShapes();
        return;
    }

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
        if (state.currentTool === 'draw' && state.currentDrawPath.length > 1) {
            state.shapes.push({ type: 'draw', points: state.currentDrawPath });
            state.currentDrawPath = [];
        }
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

    const noModifiers = !e.ctrlKey && !e.altKey && !e.metaKey;

    switch (e.key.toLowerCase()) {
        case 'r':
            if (noModifiers) setTool('rectangle');
            break;
        case 'a':
            if (noModifiers) setTool('arrow');
            break;
        case 't':
            if (noModifiers) {
                console.log('Setting tool to text');
                setTool('text');
            }
            break;
        case 'd':
            if (noModifiers) setTool('draw');
            break;
        case 'escape':
            // ESC toggles pause: Active <-> Paused
            // When paused, annotations stay visible but user can interact with desktop
            // Press ESC again to resume drawing, press Hotkey to close completely
            togglePause();
            break;
        case 'c':
            if (noModifiers) clearAll();
            break;
    }
});

// --- Window Events ---

window.addEventListener('resize', resizeCanvas);

// --- Tauri Events ---

// Track if we need a fresh start (set when hidden, cleared when shown)
let needsFreshStart = true;

/**
 * Completely reset all state for fresh start
 * Exposed globally so Rust can call it via eval()
 */
window.forceCompleteReset = function() {
    console.log('Forcing complete reset of all state');
    
    // Clear state arrays
    state.shapes = [];
    state.isDrawing = false;
    state.currentDrawPath = [];
    
    // Remove all text elements from DOM
    state.textElements.forEach(el => {
        if (el.parentNode) el.parentNode.removeChild(el);
    });
    state.textElements = [];
    
    // Also clear any orphaned text elements
    const textContainer = document.getElementById('text-container');
    if (textContainer) {
        while (textContainer.firstChild) {
            textContainer.removeChild(textContainer.firstChild);
        }
    }
    
    // Force canvas reset (reassigns dimensions which clears everything)
    resetCanvas();
    
    // Reset tool
    applyTool('rectangle');
    
    needsFreshStart = false;
}

// Local reference for easier calling
const forceCompleteReset = window.forceCompleteReset;

// Listen for overlay shown event to reset state
listen('overlay-shown', () => {
    console.log('overlay-shown event received');
    // Always do a complete reset when overlay is shown fresh
    forceCompleteReset();
    
    // Double-check with delayed reset to handle any rendering race conditions
    setTimeout(() => {
        if (state.shapes.length === 0) {
            // State is already clear, just make sure canvas is clear too
            resetCanvas();
        }
    }, 50);
    
    // Triple-check with requestAnimationFrame
    requestAnimationFrame(() => {
        if (state.shapes.length === 0) {
            resetCanvas();
        }
    });
});

// Listen for overlay hidden event
listen('overlay-hidden', () => {
    console.log('overlay-hidden event received');
    // Mark that we need a fresh start next time
    needsFreshStart = true;
    // Clear everything when hidden
    clearAll();
});

// Backup: Also reset on window focus if we need a fresh start
// This catches cases where the Tauri event might not fire properly
window.addEventListener('focus', () => {
    if (needsFreshStart) {
        console.log('Window focused with needsFreshStart=true, forcing reset');
        forceCompleteReset();
    }
});

// Backup: Also reset on visibility change
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && needsFreshStart) {
        console.log('Visibility changed to visible with needsFreshStart=true, forcing reset');
        forceCompleteReset();
    }
});

// Sync tool selection across all overlay windows
listen('tool-changed', (event) => {
    applyTool(event.payload);
});

// Listen for overlay paused event - annotations stay, drawing disabled
listen('overlay-paused', () => {
    console.log('Overlay paused - annotations visible, interaction disabled');
    // Cancel any in-progress drawing
    state.isDrawing = false;
});

// Listen for overlay resumed event - re-enable drawing
listen('overlay-resumed', () => {
    console.log('Overlay resumed - drawing re-enabled');
    // Restore current tool
    setTool(state.currentTool);
    resizeCanvas();
});

// ============================================================================
// INITIALIZATION
// ============================================================================

function init() {
    // Force complete reset on init to ensure clean state
    forceCompleteReset();
    
    console.log('Screen Annotator initialized');
    console.log('Shortcuts: R=Rectangle, A=Arrow, T=Text, D=Draw, ESC=Pause/Resume, C=Clear');
}

// Start when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
