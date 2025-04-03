import rhino3dm from 'rhino3dm'

const downloadButton = document.getElementById('downloadButton')
downloadButton.onclick = download

let _model = {
  curves: [],
  points: null,
  viewport: null
}

// Load rhino3dm
const rhino = await rhino3dm()
console.log('Loaded rhino3dm:', rhino)

// Initialize
run()

function run() {
  const canvas = getCanvas()
  canvas.addEventListener('mousedown', onMouseDown)
  canvas.addEventListener('mousemove', onMouseMove)
  window.addEventListener('keyup', onKeyUp)

  _model.points = new rhino.Point3dList()

  _model.viewport = new rhino.ViewportInfo()
  _model.viewport.screenPort = [0, 0, canvas.clientWidth, canvas.clientHeight]
  // Camera frustum from -30..+30
  _model.viewport.setFrustum(-30, 30, -30, 30, 1, 1000)

  draw()
}

/* -----------------------------------
   Download .3dm (no write-options)
----------------------------------- */
function download() {
  if (_model.curves.length < 1) {
    console.log('No geometry to download!')
    return
  }
  const doc = new rhino.File3dm()

  for (let c of _model.curves) {
    doc.objects().add(c, null)
  }

  // Older builds want no arguments in toByteArray()
  const buffer = doc.toByteArray()
  saveByteArray('sketch2d.3dm', buffer)
  doc.delete()
}

function saveByteArray(fileName, byte) {
  const blob = new Blob([byte], { type: 'application/octet-stream' })
  const link = document.createElement('a')
  link.href = window.URL.createObjectURL(blob)
  link.download = fileName
  link.click()
}

/* -----------------------------------
   MOUSE: Build NURBS from clicks
----------------------------------- */
function onMouseDown(evt) {
  let [x, y] = getXY(evt)

  if (_model.points.count === 0) {
    _model.points.add(x, y, 0)
  }
  _model.points.add(x, y, 0)
  draw()
}

function onMouseMove(evt) {
  let i = _model.points.count - 1
  if (i >= 0) {
    let [x, y] = getXY(evt)
    _model.points.set(i, [x, y, 0])
    draw()
  }
}

/* -----------------------------------
   Keyboard shortcuts
----------------------------------- */
function onKeyUp(evt) {
  switch (evt.key) {
    case 'Enter':
      finalizeNurbs()
      break
    case 'l':
      addLine()
      break
    case 'p':
      addPolyline()
      break
    case 'c':
      addCircle()
      break
  }
  draw()
}

/* -----------------------------------
   Finalize the current NURBS curve
----------------------------------- */
function finalizeNurbs() {
  if (_model.points.count < 4) {
    console.warn('Not enough points to finalize the curve.')
    return
  }
  // Remove trailing 'live' point
  _model.points.removeAt(_model.points.count - 1)

  let degree = _model.points.count - 1
  if (degree > 3) degree = 3

  let nurbs = rhino.NurbsCurve.create(true, degree, _model.points)
  _model.curves.push(nurbs)

  _model.points.clear()
  downloadButton.disabled = false
  draw()
}

/* -----------------------------------
   Add shapes with older-build methods
----------------------------------- */
function addLine() {
  // A line is a degree=1 curve with 2 points
  let ptList = new rhino.Point3dList()
  ptList.add(0, 0, 0)
  ptList.add(10, 10, 0)
  let lineCrv = rhino.NurbsCurve.create(false, 1, ptList)
  _model.curves.push(lineCrv)
  draw()
}

function addPolyline() {
  let ptList = new rhino.Point3dList()
  ptList.add(0, 0, 0)
  ptList.add(5, 10, 0)
  ptList.add(10, 0, 0)
  // Another degree=1 curve
  let polyCrv = rhino.NurbsCurve.create(false, 1, ptList)
  _model.curves.push(polyCrv)
  draw()
}

/**
 * Older builds won't let us create a Plane or call createCircle(plane, radius).
 * So let's approximate a circle with a NURBS curve that has e.g. 12 points around a center.
 */
function addCircle() {
  let centerX = 5
  let centerY = 5
  let radius  = 3
  let divisions = 12

  let pts = new rhino.Point3dList()

  // create 12 points around a circle
  for (let i = 0; i < divisions; i++) {
    let angle = (2 * Math.PI) * (i / divisions)
    let px = centerX + radius * Math.cos(angle)
    let py = centerY + radius * Math.sin(angle)
    pts.add(px, py, 0)
  }

  // add first point again to close
  let firstPt = pts.get(0)
  pts.add(firstPt[0], firstPt[1], firstPt[2])

  // Make a closed, degree=3 NURBS from these points
  let degree = 3
  let circleApprox = rhino.NurbsCurve.create(true, degree, pts)

  _model.curves.push(circleApprox)
  draw()
}

/* -----------------------------------
   Helpers: Canvas, XY transform
----------------------------------- */
function getCanvas() {
  return document.getElementById('canvas')
}

function getXY(evt) {
  const canvas = getCanvas()
  const rect = canvas.getBoundingClientRect()
  let x = evt.clientX - rect.left
  let y = evt.clientY - rect.top

  let s2w = _model.viewport.getXform(rhino.CoordinateSystem.Screen, rhino.CoordinateSystem.World)
  let pt = rhino.Point3d.transform([x, y, 0], s2w)
  s2w.delete()

  return [pt[0], pt[1]]
}

/* -----------------------------------
   draw(): grid + curves
----------------------------------- */
function draw() {
  const canvas = getCanvas()
  const ctx = canvas.getContext('2d')
  const w2s = _model.viewport.getXform(rhino.CoordinateSystem.World, rhino.CoordinateSystem.Screen)

  ctx.beginPath()
  ctx.lineWidth = 0.5
  ctx.strokeStyle = 'rgb(130,130,130)'
  ctx.clearRect(0, 0, canvas.width, canvas.height)

  // grid lines
  for (let i = 0; i < 50; i++) {
    let [x, y]   = rhino.Point3d.transform([i, -50, 0], w2s)
    let [x1, y1] = rhino.Point3d.transform([i, 50, 0], w2s)
    ctx.moveTo(x, y)
    ctx.lineTo(x1, y1)

    ;[x, y]      = rhino.Point3d.transform([-i, -50, 0], w2s)
    ;[x1, y1]    = rhino.Point3d.transform([-i, 50, 0], w2s)
    ctx.moveTo(x, y)
    ctx.lineTo(x1, y1)

    ;[x, y]      = rhino.Point3d.transform([-50, i, 0], w2s)
    ;[x1, y1]    = rhino.Point3d.transform([50, i, 0], w2s)
    ctx.moveTo(x, y)
    ctx.lineTo(x1, y1)

    ;[x, y]      = rhino.Point3d.transform([-50, -i, 0], w2s)
    ;[x1, y1]    = rhino.Point3d.transform([50, -i, 0], w2s)
    ctx.moveTo(x, y)
    ctx.lineTo(x1, y1)
  }
  ctx.stroke()

  // draw stored curves
  for (const crv of _model.curves) {
    drawNurbsCurve(ctx, crv, w2s)
  }

  // draw the 'in-progress' curve from points
  if (_model.points && _model.points.count > 0) {
    let deg = Math.min(_model.points.count - 1, 3)
    let temp = rhino.NurbsCurve.create(true, deg, _model.points)
    drawNurbsCurve(ctx, temp, w2s)
    drawControlPolygon(ctx, _model.points)
    temp.delete()
  }

  w2s.delete()
}

/* -----------------------------------
   drawNurbsCurve: subdivides the curve
----------------------------------- */
function drawNurbsCurve(ctx, curve, w2s) {
  ctx.lineWidth = 1
  ctx.strokeStyle = 'black'
  ctx.beginPath()

  let divs = 200
  let [t0, t1] = curve.domain
  let wPt0 = curve.pointAt(t0)
  let sPt0 = rhino.Point3d.transform(wPt0, w2s)
  ctx.moveTo(sPt0[0], sPt0[1])

  for (let i = 1; i <= divs; i++) {
    let t = t0 + (i / divs) * (t1 - t0)
    let wPt = curve.pointAt(t)
    let sPt = rhino.Point3d.transform(wPt, w2s)
    ctx.lineTo(sPt[0], sPt[1])
  }
  ctx.stroke()
}

/* -----------------------------------
   drawControlPolygon
----------------------------------- */
function drawControlPolygon(ctx, points) {
  ctx.strokeStyle = 'darkgray'
  ctx.setLineDash([4,4])
  ctx.beginPath()

  const w2s = _model.viewport.getXform(rhino.CoordinateSystem.World, rhino.CoordinateSystem.Screen)
  for (let i = 0; i < points.count; i++) {
    let p = points.get(i)
    let sp = rhino.Point3d.transform(p, w2s)
    if (i === 0) {
      ctx.moveTo(sp[0], sp[1])
    } else {
      ctx.lineTo(sp[0], sp[1])
    }
  }
  if (points.count > 2) {
    let first = points.get(0)
    let sp0 = rhino.Point3d.transform(first, w2s)
    ctx.lineTo(sp0[0], sp0[1])
  }
  ctx.stroke()
  ctx.setLineDash([])

  // squares at each control point
  ctx.fillStyle = 'white'
  ctx.strokeStyle = 'black'
  for (let i = 0; i < points.count; i++) {
    let p = points.get(i)
    let sp = rhino.Point3d.transform(p, w2s)
    ctx.fillRect(sp[0] - 1, sp[1] - 1, 3, 3)
    ctx.strokeRect(sp[0] - 2, sp[1] - 2, 5, 5)
  }

  w2s.delete()
}
