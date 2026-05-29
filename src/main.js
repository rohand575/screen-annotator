/**
 * Screen Annotator - Drawing Engine
 */

const { invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;

// ============================================================================
// CONFIG
// ============================================================================
const CONFIG = {
    colors: { rectangle: '#ff3366', arrow: '#00ccff', draw: '#00ff88' },
    stroke: { rectangleWidth: 4, arrowWidth: 4, arrowHeadSize: 20, drawWidth: 3 },
};

const HANDLE_SIZE = 8;
const HANDLE_HIT  = HANDLE_SIZE + 4;
const HANDLE_CURSORS = {
    nw: 'nw-resize', n: 'n-resize',  ne: 'ne-resize',
    e:  'e-resize',  se: 'se-resize', s:  's-resize',
    sw: 'sw-resize', w:  'w-resize',
};

// ============================================================================
// STATE
// ============================================================================
const state = {
    currentTool:     'rectangle',
    isDrawing:       false,
    startX: 0, startY: 0,
    shapes:          [],   // { type:'rectangle'|'arrow'|'draw', x1,y1,x2,y2 | points:[] }
    textElements:    [],   // DOM input elements
    currentDrawPath: [],
    images:          [],   // { img, x, y, width, height }
    // unified selection: { kind:'shape'|'image'|'text', obj }
    selected:        null,
    // unified interaction (drag/resize)
    interaction:     null,
};

// ============================================================================
// CANVAS
// ============================================================================
const canvas        = document.getElementById('canvas');
const ctx           = canvas.getContext('2d');
const textContainer = document.getElementById('text-container');

function resizeCanvas() { resetCanvas(); redrawAllShapes(); }

function clearCanvas() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.scale(window.devicePixelRatio || 1, window.devicePixelRatio || 1);
}

function resetCanvas() {
    const dpr = window.devicePixelRatio || 1;
    canvas.width  = window.innerWidth  * dpr;
    canvas.height = window.innerHeight * dpr;
    canvas.style.width  = window.innerWidth  + 'px';
    canvas.style.height = window.innerHeight + 'px';
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
}

function redrawAllShapes() {
    clearCanvas();
    // Layer 1: images
    state.images.forEach(img => {
        ctx.drawImage(img.img, img.x, img.y, img.width, img.height);
    });
    // Layer 2: shapes
    state.shapes.forEach(drawShape);
    // Layer 3: selection overlays (on top of everything)
    if (state.selected) {
        const { kind, obj } = state.selected;
        if      (kind === 'image') drawImageSelection(obj);
        else if (kind === 'shape') drawShapeSelection(obj);
        else if (kind === 'text')  drawTextSelection(obj);
    }
}

// ============================================================================
// DRAW PRIMITIVES
// ============================================================================

function drawShape(shape) {
    if      (shape.type === 'rectangle') drawRectangle(shape.x1, shape.y1, shape.x2, shape.y2);
    else if (shape.type === 'arrow')     drawArrow(shape.x1, shape.y1, shape.x2, shape.y2);
    else if (shape.type === 'draw')      drawFreePath(shape.points);
}

function drawRectangle(x1, y1, x2, y2) {
    ctx.save();
    ctx.strokeStyle = CONFIG.colors.rectangle;
    ctx.lineWidth   = CONFIG.stroke.rectangleWidth;
    ctx.lineCap = ctx.lineJoin = 'round';
    ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 4;
    ctx.shadowOffsetX = ctx.shadowOffsetY = 2;
    ctx.strokeRect(Math.min(x1,x2), Math.min(y1,y2), Math.abs(x2-x1), Math.abs(y2-y1));
    ctx.restore();
}

function drawArrow(x1, y1, x2, y2) {
    const hs = CONFIG.stroke.arrowHeadSize;
    const angle = Math.atan2(y2-y1, x2-x1);
    ctx.save();
    ctx.strokeStyle = ctx.fillStyle = CONFIG.colors.arrow;
    ctx.lineWidth = CONFIG.stroke.arrowWidth;
    ctx.lineCap = ctx.lineJoin = 'round';
    ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 4;
    ctx.shadowOffsetX = ctx.shadowOffsetY = 2;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2 - hs * Math.cos(angle) * 0.5, y2 - hs * Math.sin(angle) * 0.5);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - hs*Math.cos(angle-Math.PI/6), y2 - hs*Math.sin(angle-Math.PI/6));
    ctx.lineTo(x2 - hs*Math.cos(angle+Math.PI/6), y2 - hs*Math.sin(angle+Math.PI/6));
    ctx.closePath(); ctx.fill();
    ctx.restore();
}

function drawFreePath(points) {
    if (points.length < 2) return;
    ctx.save();
    ctx.strokeStyle = CONFIG.colors.draw;
    ctx.lineWidth = CONFIG.stroke.drawWidth;
    ctx.lineCap = ctx.lineJoin = 'round';
    ctx.shadowColor = 'rgba(0,0,0,0.4)'; ctx.shadowBlur = 3;
    ctx.shadowOffsetX = ctx.shadowOffsetY = 1;
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
    ctx.stroke();
    ctx.restore();
}

// ============================================================================
// SELECTION OVERLAYS
// ============================================================================

function sqHandle(x, y) {
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#0088ff'; ctx.lineWidth = 1.5;
    ctx.fillRect(x - HANDLE_SIZE/2, y - HANDLE_SIZE/2, HANDLE_SIZE, HANDLE_SIZE);
    ctx.strokeRect(x - HANDLE_SIZE/2, y - HANDLE_SIZE/2, HANDLE_SIZE, HANDLE_SIZE);
}

function circleHandle(x, y) {
    ctx.beginPath(); ctx.arc(x, y, HANDLE_SIZE/2 + 1, 0, Math.PI*2);
    ctx.fillStyle = '#fff'; ctx.fill();
    ctx.strokeStyle = '#0088ff'; ctx.lineWidth = 2; ctx.stroke();
}

function dashedRect(x, y, w, h) {
    ctx.strokeStyle = '#0088ff'; ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 3]);
    ctx.strokeRect(x, y, w, h);
    ctx.setLineDash([]);
}

function drawImageSelection(img) {
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.3)'; ctx.shadowBlur = 3;
    dashedRect(img.x, img.y, img.width, img.height);
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0;
    eightHandles(img.x, img.y, img.width, img.height).forEach(h => sqHandle(h.x, h.y));
    ctx.restore();
}

function drawShapeSelection(shape) {
    ctx.save();
    if (shape.type === 'rectangle') {
        const x = Math.min(shape.x1,shape.x2), y = Math.min(shape.y1,shape.y2);
        const w = Math.abs(shape.x2-shape.x1),  h = Math.abs(shape.y2-shape.y1);
        dashedRect(x-4, y-4, w+8, h+8);
        eightHandles(x, y, w, h).forEach(h => sqHandle(h.x, h.y));
    } else if (shape.type === 'arrow') {
        circleHandle(shape.x1, shape.y1);
        circleHandle(shape.x2, shape.y2);
    } else if (shape.type === 'draw') {
        const b = freehandBounds(shape);
        dashedRect(b.x-6, b.y-6, b.w+12, b.h+12);
        sqHandle(b.x + b.w/2, b.y + b.h/2); // center drag indicator
    }
    ctx.restore();
}

function drawTextSelection(el) {
    const l = parseFloat(el.style.left), t = parseFloat(el.style.top);
    const w = el.offsetWidth, h = el.offsetHeight;
    ctx.save();
    dashedRect(l-3, t-3, w+6, h+6);
    ctx.restore();
}

// ============================================================================
// HANDLE GEOMETRY
// ============================================================================

function eightHandles(x, y, w, h) {
    const cx = x+w/2, cy = y+h/2;
    return [
        {id:'nw',x,y}, {id:'n',x:cx,y}, {id:'ne',x:x+w,y},
        {id:'e',x:x+w,y:cy}, {id:'se',x:x+w,y:y+h},
        {id:'s',x:cx,y:y+h}, {id:'sw',x,y:y+h}, {id:'w',x,y:cy},
    ];
}

function rectHandles(shape) {
    return eightHandles(
        Math.min(shape.x1,shape.x2), Math.min(shape.y1,shape.y2),
        Math.abs(shape.x2-shape.x1), Math.abs(shape.y2-shape.y1)
    );
}

function arrowHandles(shape) {
    return [{id:'start',x:shape.x1,y:shape.y1}, {id:'end',x:shape.x2,y:shape.y2}];
}

function imageHandles(img) {
    return eightHandles(img.x, img.y, img.width, img.height);
}

function freehandBounds(shape) {
    let minX=Infinity, minY=Infinity, maxX=-Infinity, maxY=-Infinity;
    for (const p of shape.points) {
        minX=Math.min(minX,p.x); minY=Math.min(minY,p.y);
        maxX=Math.max(maxX,p.x); maxY=Math.max(maxY,p.y);
    }
    return {x:minX, y:minY, w:maxX-minX, h:maxY-minY};
}

// ============================================================================
// HIT TESTING
// ============================================================================

function hitSelectedHandle(mx, my) {
    if (!state.selected) return null;
    const {kind, obj} = state.selected;
    let handles = [];
    if      (kind === 'image' && obj.type !== 'draw') handles = imageHandles(obj);
    else if (kind === 'shape' && obj.type === 'rectangle') handles = rectHandles(obj);
    else if (kind === 'shape' && obj.type === 'arrow')     handles = arrowHandles(obj);
    for (const h of handles) {
        const slop = (h.id === 'start' || h.id === 'end') ? HANDLE_HIT + 4 : HANDLE_HIT;
        if (Math.hypot(mx-h.x, my-h.y) <= slop) return h;
    }
    return null;
}

function hitImage(mx, my) {
    for (let i = state.images.length-1; i >= 0; i--) {
        const img = state.images[i];
        if (mx >= img.x && mx <= img.x+img.width && my >= img.y && my <= img.y+img.height) return img;
    }
    return null;
}

function hitAnyShape(mx, my) {
    for (let i = state.shapes.length-1; i >= 0; i--) {
        if (hitShape(state.shapes[i], mx, my)) return state.shapes[i];
    }
    return null;
}

function hitShape(s, mx, my) {
    const slop = 10;
    if (s.type === 'rectangle') {
        const x1=Math.min(s.x1,s.x2), y1=Math.min(s.y1,s.y2);
        const x2=Math.max(s.x1,s.x2), y2=Math.max(s.y1,s.y2);
        return mx>=x1-slop && mx<=x2+slop && my>=y1-slop && my<=y2+slop;
    }
    if (s.type === 'arrow') {
        return Math.hypot(mx-s.x1,my-s.y1)<=slop ||
               Math.hypot(mx-s.x2,my-s.y2)<=slop ||
               nearSegment(mx, my, s.x1, s.y1, s.x2, s.y2, slop);
    }
    if (s.type === 'draw') {
        const b = freehandBounds(s);
        return mx>=b.x-slop && mx<=b.x+b.w+slop && my>=b.y-slop && my<=b.y+b.h+slop;
    }
    return false;
}

function hitAnyText(mx, my) {
    for (let i = state.textElements.length-1; i >= 0; i--) {
        const r = state.textElements[i].getBoundingClientRect();
        if (mx>=r.left && mx<=r.right && my>=r.top && my<=r.bottom) return state.textElements[i];
    }
    return null;
}

function nearSegment(px, py, x1, y1, x2, y2, tol) {
    const dx=x2-x1, dy=y2-y1, lenSq=dx*dx+dy*dy;
    if (lenSq===0) return Math.hypot(px-x1,py-y1)<=tol;
    const t = Math.max(0, Math.min(1, ((px-x1)*dx+(py-y1)*dy)/lenSq));
    return Math.hypot(px-(x1+t*dx), py-(y1+t*dy)) <= tol;
}

function selectCursor(mx, my) {
    const h = hitSelectedHandle(mx, my);
    if (h) return (h.id==='start'||h.id==='end') ? 'crosshair' : (HANDLE_CURSORS[h.id]||'crosshair');
    if (hitImage(mx,my) || hitAnyShape(mx,my) || hitAnyText(mx,my)) return 'move';
    return 'default';
}

// ============================================================================
// INTERACTIONS
// ============================================================================

function applyInteraction(ia, dx, dy) {
    const {type, obj} = ia;
    if (type === 'drag-image') {
        obj.x = ia.origX + dx; obj.y = ia.origY + dy;
    } else if (type === 'resize-image') {
        applyRectResize(ia, dx, dy, (x,y,w,h) => { obj.x=x; obj.y=y; obj.width=w; obj.height=h; });
    } else if (type === 'drag-shape') {
        if (obj.type === 'draw') {
            obj.points = ia.origPoints.map(p => ({x: p.x+dx, y: p.y+dy}));
        } else {
            obj.x1=ia.ox1+dx; obj.y1=ia.oy1+dy; obj.x2=ia.ox2+dx; obj.y2=ia.oy2+dy;
        }
    } else if (type === 'resize-shape') {
        applyRectResize(ia, dx, dy, (x,y,w,h) => { obj.x1=x; obj.y1=y; obj.x2=x+w; obj.y2=y+h; });
    } else if (type === 'arrow-endpoint') {
        if (ia.endpoint==='start') { obj.x1=ia.ox1+dx; obj.y1=ia.oy1+dy; }
        else                       { obj.x2=ia.ox2+dx; obj.y2=ia.oy2+dy; }
    }
}

function applyRectResize(ia, dx, dy, apply) {
    const {handle:hid, origX:ox, origY:oy, origW:ow, origH:oh} = ia;
    const min=20; let x=ox, y=oy, w=ow, h=oh;
    switch(hid) {
        case 'nw':{ const nw=Math.max(min,ow-dx),nh=Math.max(min,oh-dy); x=ox+ow-nw; y=oy+oh-nh; w=nw; h=nh; break; }
        case 'n': { const nh=Math.max(min,oh-dy); y=oy+oh-nh; h=nh; break; }
        case 'ne':{ const nh=Math.max(min,oh-dy); y=oy+oh-nh; w=Math.max(min,ow+dx); h=nh; break; }
        case 'e': { w=Math.max(min,ow+dx); break; }
        case 'se':{ w=Math.max(min,ow+dx); h=Math.max(min,oh+dy); break; }
        case 's': { h=Math.max(min,oh+dy); break; }
        case 'sw':{ const nw=Math.max(min,ow-dx); x=ox+ow-nw; w=nw; h=Math.max(min,oh+dy); break; }
        case 'w': { const nw=Math.max(min,ow-dx); x=ox+ow-nw; w=nw; break; }
    }
    apply(x, y, w, h);
}

// ============================================================================
// IMAGE PASTE
// ============================================================================

function loadImageBlob(blob) {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
        const maxW = window.innerWidth*0.8, maxH = window.innerHeight*0.8;
        let w = img.naturalWidth, h = img.naturalHeight;
        if (w>maxW || h>maxH) { const s=Math.min(maxW/w,maxH/h); w=Math.round(w*s); h=Math.round(h*s); }
        const imgShape = { img, x: Math.round((window.innerWidth-w)/2), y: Math.round((window.innerHeight-h)/2), width:w, height:h };
        state.images.push(imgShape);
        state.selected = { kind:'image', obj:imgShape };
        // Auto-switch to select mode so user can position the image
        applyTool('select');
        document.body.className = 'select-mode';
        invoke('broadcast_tool', { tool:'select' });
        redrawAllShapes();
    };
    img.src = url;
}

function deleteSelected() {
    if (!state.selected) return;
    const {kind, obj} = state.selected;
    if (kind==='image') {
        const i = state.images.indexOf(obj); if (i>-1) state.images.splice(i,1);
    } else if (kind==='shape') {
        const i = state.shapes.indexOf(obj); if (i>-1) state.shapes.splice(i,1);
    } else if (kind==='text') {
        obj.remove();
        const i = state.textElements.indexOf(obj); if (i>-1) state.textElements.splice(i,1);
    }
    state.selected = null;
    redrawAllShapes();
}

// ============================================================================
// TEXT BOX
// ============================================================================

function createTextBox(x, y) {
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'floating-text';
    input.style.left = x + 'px';
    input.style.top  = y + 'px';
    input.style.width = '30px';

    let fontSize = 18;
    const mirror = document.createElement('span');
    mirror.style.cssText = 'position:absolute;visibility:hidden;white-space:pre;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;font-size:18px;font-weight:600;padding:8px 12px;left:-9999px;top:-9999px;';
    document.body.appendChild(mirror);

    function resizeInput() {
        mirror.textContent = input.value;
        input.style.width = Math.max(30, mirror.offsetWidth + 6) + 'px';
    }

    input.addEventListener('input', resizeInput);

    // Drag in select mode
    input.addEventListener('mousedown', (e) => {
        if (state.currentTool !== 'select') return;
        e.preventDefault(); e.stopPropagation();
        state.selected = { kind:'text', obj:input };
        redrawAllShapes();
        const sx=e.clientX, sy=e.clientY;
        const ol=parseFloat(input.style.left), ot=parseFloat(input.style.top);
        function onMove(ev) {
            input.style.left = (ol + ev.clientX-sx) + 'px';
            input.style.top  = (ot + ev.clientY-sy) + 'px';
            redrawAllShapes();
        }
        function onUp() {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
        }
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    });

    state.textElements.push(input);
    textContainer.appendChild(input);
    setTimeout(() => input.focus(), 10);

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
        if (e.ctrlKey && (e.key==='+' || e.key==='=')) {
            e.preventDefault();
            fontSize = Math.min(fontSize+2, 96);
            input.style.fontSize = mirror.style.fontSize = fontSize + 'px';
            resizeInput();
        }
        if (e.ctrlKey && e.key==='-') {
            e.preventDefault();
            fontSize = Math.max(fontSize-2, 8);
            input.style.fontSize = mirror.style.fontSize = fontSize + 'px';
            resizeInput();
        }
        if (e.key==='Escape' && input.value.trim()==='') {
            mirror.remove(); input.remove();
            const i = state.textElements.indexOf(input); if (i>-1) state.textElements.splice(i,1);
        }
        e.stopPropagation();
    });

    input.addEventListener('blur', () => {
        mirror.remove();
        if (input.value.trim()==='') {
            input.remove();
            const i = state.textElements.indexOf(input); if (i>-1) state.textElements.splice(i,1);
        }
    });
}

// ============================================================================
// TOOL MANAGEMENT
// ============================================================================

function setTool(tool) {
    const leavingSelect = (state.currentTool==='select' && tool!=='select');
    state.currentTool = tool;
    document.body.className = tool + '-mode';
    invoke('broadcast_tool', { tool });
    if (leavingSelect) {
        state.selected = null;
        state.interaction = null;
        canvas.style.cursor = '';
        redrawAllShapes();
    }
}

function applyTool(tool) {
    state.currentTool = tool;
    document.body.className = tool + '-mode';
}

// ============================================================================
// CLEAR / PAUSE
// ============================================================================

async function togglePause() {
    if (document.activeElement?.classList.contains('floating-text')) document.activeElement.blur();
    await invoke('toggle_pause_cmd');
}

function clearAll() {
    clearCanvas();
    state.shapes = []; state.images = [];
    state.textElements.forEach(el => el.remove());
    state.textElements = [];
    state.selected = null; state.interaction = null;
    canvas.style.cursor = '';
}

// ============================================================================
// MOUSE EVENTS
// ============================================================================

canvas.addEventListener('mousedown', (e) => {

    // ── SELECT MODE ──
    if (state.currentTool === 'select') {

        // 1. Handle hit on selected item's resize/endpoint handles
        const handle = hitSelectedHandle(e.clientX, e.clientY);
        if (handle && state.selected) {
            const {kind, obj} = state.selected;
            if (kind==='image') {
                state.interaction = { type:'resize-image', obj, handle:handle.id,
                    startX:e.clientX, startY:e.clientY,
                    origX:obj.x, origY:obj.y, origW:obj.width, origH:obj.height };
            } else if (kind==='shape' && obj.type==='rectangle') {
                state.interaction = { type:'resize-shape', obj, handle:handle.id,
                    startX:e.clientX, startY:e.clientY,
                    origX:Math.min(obj.x1,obj.x2), origY:Math.min(obj.y1,obj.y2),
                    origW:Math.abs(obj.x2-obj.x1), origH:Math.abs(obj.y2-obj.y1) };
            } else if (kind==='shape' && obj.type==='arrow') {
                state.interaction = { type:'arrow-endpoint', obj, endpoint:handle.id,
                    startX:e.clientX, startY:e.clientY,
                    ox1:obj.x1, oy1:obj.y1, ox2:obj.x2, oy2:obj.y2 };
            }
            if (state.interaction) return;
        }

        // 2. Shape hit
        const shapeHit = hitAnyShape(e.clientX, e.clientY);
        if (shapeHit) {
            state.selected = { kind:'shape', obj:shapeHit };
            const ia = { type:'drag-shape', obj:shapeHit, startX:e.clientX, startY:e.clientY };
            if (shapeHit.type==='draw') ia.origPoints = shapeHit.points.map(p=>({...p}));
            else { ia.ox1=shapeHit.x1; ia.oy1=shapeHit.y1; ia.ox2=shapeHit.x2; ia.oy2=shapeHit.y2; }
            state.interaction = ia;
            redrawAllShapes(); return;
        }

        // 3. Image hit
        const imgHit = hitImage(e.clientX, e.clientY);
        if (imgHit) {
            state.selected = { kind:'image', obj:imgHit };
            state.interaction = { type:'drag-image', obj:imgHit,
                startX:e.clientX, startY:e.clientY, origX:imgHit.x, origY:imgHit.y };
            redrawAllShapes(); return;
        }

        // 4. Deselect on empty click
        if (state.selected) { state.selected = null; redrawAllShapes(); }
        return;
    }

    // ── DRAWING MODES ──
    // Clear any leftover selection when drawing
    if (state.selected) { state.selected = null; redrawAllShapes(); }

    if (state.currentTool==='text') { createTextBox(e.clientX, e.clientY); return; }
    if (state.currentTool==='draw') {
        state.isDrawing = true;
        state.currentDrawPath = [{x:e.clientX, y:e.clientY}];
        return;
    }
    state.isDrawing = true;
    state.startX = e.clientX; state.startY = e.clientY;
});

canvas.addEventListener('mousemove', (e) => {
    // Active interaction (drag/resize)
    if (state.interaction) {
        applyInteraction(state.interaction, e.clientX-state.interaction.startX, e.clientY-state.interaction.startY);
        redrawAllShapes(); return;
    }

    // Cursor
    if (state.currentTool==='select') {
        canvas.style.cursor = selectCursor(e.clientX, e.clientY);
    } else {
        canvas.style.cursor = '';
    }

    if (!state.isDrawing) return;

    if (state.currentTool==='draw') {
        state.currentDrawPath.push({x:e.clientX, y:e.clientY});
        redrawAllShapes();
        drawFreePath(state.currentDrawPath);
        return;
    }
    redrawAllShapes();
    if (state.currentTool==='rectangle') drawRectangle(state.startX, state.startY, e.clientX, e.clientY);
    else if (state.currentTool==='arrow') drawArrow(state.startX, state.startY, e.clientX, e.clientY);
});

canvas.addEventListener('mouseup', (e) => {
    if (state.interaction) { state.interaction = null; return; }
    if (!state.isDrawing) return;
    state.isDrawing = false;

    if (state.currentTool==='draw') {
        if (state.currentDrawPath.length > 1) state.shapes.push({type:'draw', points:state.currentDrawPath});
        state.currentDrawPath = []; redrawAllShapes(); return;
    }
    const shape = {type:state.currentTool, x1:state.startX, y1:state.startY, x2:e.clientX, y2:e.clientY};
    if (Math.abs(shape.x2-shape.x1)>5 || Math.abs(shape.y2-shape.y1)>5) state.shapes.push(shape);
    redrawAllShapes();
});

canvas.addEventListener('mouseleave', () => {
    if (state.interaction) { state.interaction = null; canvas.style.cursor = ''; }
    if (state.isDrawing) {
        state.isDrawing = false;
        if (state.currentTool==='draw' && state.currentDrawPath.length>1) {
            state.shapes.push({type:'draw', points:state.currentDrawPath});
            state.currentDrawPath = [];
        }
        redrawAllShapes();
    }
});

// ── Paste ──
document.addEventListener('paste', (e) => {
    if (document.activeElement?.classList.contains('floating-text')) return;
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of Array.from(items)) {
        if (item.type.startsWith('image/')) {
            e.preventDefault();
            const blob = item.getAsFile();
            if (blob) loadImageBlob(blob);
            break;
        }
    }
});

// ── Keyboard ──
document.addEventListener('keydown', (e) => {
    if (e.target.classList.contains('floating-text')) return;
    const noMod = !e.ctrlKey && !e.altKey && !e.metaKey;
    switch (e.key.toLowerCase()) {
        case 'r': if (noMod) setTool('rectangle'); break;
        case 'a': if (noMod) setTool('arrow');     break;
        case 't': if (noMod) setTool('text');       break;
        case 'd': if (noMod) setTool('draw');       break;
        case 's': if (noMod) setTool('select');     break;
        case 'escape': togglePause(); break;
        case 'c': if (noMod) clearAll(); break;
        case 'delete':
        case 'backspace':
            if (noMod && state.selected) { e.preventDefault(); deleteSelected(); }
            break;
    }
});

window.addEventListener('resize', resizeCanvas);

// ============================================================================
// TAURI EVENTS
// ============================================================================

let needsFreshStart = true;

window.forceCompleteReset = function () {
    state.shapes = []; state.isDrawing = false; state.currentDrawPath = [];
    state.images = []; state.selected = null; state.interaction = null;
    state.textElements.forEach(el => { if (el.parentNode) el.parentNode.removeChild(el); });
    state.textElements = [];
    const tc = document.getElementById('text-container');
    if (tc) while (tc.firstChild) tc.removeChild(tc.firstChild);
    canvas.style.cursor = '';
    resetCanvas(); applyTool('rectangle'); needsFreshStart = false;
};
const forceCompleteReset = window.forceCompleteReset;

listen('overlay-shown', () => {
    forceCompleteReset();
    setTimeout(() => { if (!state.shapes.length) resetCanvas(); }, 50);
    requestAnimationFrame(() => { if (!state.shapes.length) resetCanvas(); });
});
listen('overlay-hidden', () => { needsFreshStart = true; clearAll(); });
window.addEventListener('focus', () => { if (needsFreshStart) forceCompleteReset(); });
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState==='visible' && needsFreshStart) forceCompleteReset();
});
listen('tool-changed', e => applyTool(e.payload));
listen('overlay-paused',  () => { state.isDrawing = false; });
listen('overlay-resumed', () => { setTool(state.currentTool); resizeCanvas(); });

// ============================================================================
// INIT
// ============================================================================

function init() {
    forceCompleteReset();
    console.log('Shortcuts: R=Rect  A=Arrow  T=Text  D=Draw  S=Select  ESC=Pause  C=Clear');
    console.log('Select mode: click=select  drag=move  handles=resize/repoint  Del=delete');
    console.log('Text box: Ctrl+Plus/Minus = font size');
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
