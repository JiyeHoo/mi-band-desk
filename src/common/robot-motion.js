// Pick a different character after two complete expression cycles.
const BAG = ['idle','blink','look','happy','curious','surprise','sleepy','wink','love','cry','blush','stars','angry','dizzy','uwu','owo','squint','unimpressed','plead','dead','nod','confused','ok','like','wave','peace']
export function chooseEmotion(previous, randomValue) {
  const choices = BAG.filter((name) => name !== previous)
  return choices[Math.min(choices.length - 1, Math.max(0, Math.floor(randomValue * choices.length)))]
}
