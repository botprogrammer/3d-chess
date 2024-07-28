export const playSound = (
  type: `capture` | `castle` | `move-check` | `move-self` | `promote`,
): void => {
  const audio = new Audio(`/sounds/${type}.mp3`)
  audio.volume = 0.5 // Set volume to 50%
  audio.play().catch((error) => {
    console.error(`Error playing sound:`, error)
  })
}
