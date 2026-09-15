// Tampermonkey can label downloaded audio as data:application;base64,... .
// Edge refuses that media type even though the same bytes are valid MP3/WAV.
export function audioResourceURL(file, url) {
  const mime = /\.mp3$/i.test(file) ? 'audio/mpeg' : /\.wav$/i.test(file) ? 'audio/wav' : ''
  return mime && typeof url === 'string' ? url.replace(/^data:[^;,]*(?=[;,])/i, `data:${mime}`) : url
}

export function createAudioBridge({ window, asset, status, canPlay }) {
  const playing = new Set()
  function stop() {
    for (const audio of playing) { audio.pause(); audio.currentTime = 0 }
    playing.clear()
  }
  function Audio(url) {
    const audio = new window.Audio(asset(url))
    const source = String(url).replace('/dsh-whale/', '')
    const failed = error => {
      const message = error?.name === 'NotAllowedError' ? '浏览器阻止播放，请点击角色重试并检查网站声音权限'
        : error?.message || '音频加载失败'
      status.state = '播放失败'; status.source = source; status.error = message
      console.warn('[DeepSeek Whale] 音效播放失败', source, message)
    }
    audio.addEventListener('error', () => failed(audio.error))
    audio.addEventListener('playing', () => {
      playing.add(audio)
      Object.assign(status, { state: '播放中', source, error: '' })
    })
    audio.addEventListener('pause', () => playing.delete(audio))
    audio.addEventListener('ended', () => {
      playing.delete(audio)
      Object.assign(status, { state: '播放完成', source, error: '' })
    })
    const play = audio.play.bind(audio)
    audio.play = function () {
      if (!canPlay()) return Promise.resolve()
      playing.add(audio)
      try {
        return play().catch(error => {
          playing.delete(audio)
          if (error.name !== 'AbortError') failed(error)
          throw error
        })
      } catch (error) { playing.delete(audio); failed(error); throw error }
    }
    return audio
  }
  return { Audio, stop }
}
