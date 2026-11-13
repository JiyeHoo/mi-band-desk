export const spriteNames=['open','closed','smile','sad','angry','angry-right','spiral','heart','tear','star-eye','spark','blush','anger','cancel','confirm','caret','round-eye','flat-eye','plead-eye','cross-eye','u-eye','squeeze-left','squeeze-right','hand-ok','hand-like','hand-wave','hand-peace']
export const hands={'hand-ok':'1f44c','hand-like':'1f44d','hand-wave':'1f44b','hand-peace':'270c'}

// Build-time adaptation only. Keep the upstream SVGs untouched for attribution.
// A white glove silhouette and black finger separations remain clear on OLED;
// removing the emoji's printed wave marks leaves the motion to choreography.
export function monochromeHandSVG(name, svg) {
  let result=svg.replace(/<g fill="#5DADEC">[\s\S]*?<\/g>/g,'')
  result=result.replace(/fill="#(?:FFDC5D|FFDB5E)"/g,'fill="#FFFFFF"')
  result=result.replace(/fill="#(?:EF9645|EE9547)"/g,
    name==='hand-like'||name==='hand-peace'?'fill="#000000"':'fill="#FFFFFF"')
  if(name==='hand-ok'||name==='hand-wave') {
    result=result.replace(/<path /g,'<path stroke="#000000" stroke-width="0.65" stroke-linejoin="round" ')
  }
  // The original thumb has a very fine crease. At hand size it needs a clear
  // boundary against the white palm, without any grey/skin-colour shading.
  if(name==='hand-like')result=result.replace('</svg>',
    '<path d="M10 15.4v14.7" fill="none" stroke="#000000" stroke-width="0.85" stroke-linecap="round"/></svg>')
  return result
}
