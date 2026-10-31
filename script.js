const stage = document.getElementById("stage");
const camera = document.getElementById("camera");
const onAirLamp = document.getElementById("on-air-lamp");
const onAirFlash = document.getElementById("on-air-flash");
const onAirSound = document.getElementById("on-air-sound");
const slides = Array.from(document.querySelectorAll(".slide"));
const futureClock = document.getElementById("future-clock");
const practiceTimer = document.getElementById("practice-timer");
const backgroundMusic = document.getElementById("background-music");
const seaWaves = document.getElementById("sea-waves");
const waveBrush = seaWaves.getContext("2d");
const signalBarsBox = document.querySelector(".signal-bars");
const signalBars = Array.from(signalBarsBox.querySelectorAll("span"));
const voiceOrb = document.getElementById("voice-orb");
const orbCanvas = document.getElementById("voice-orb-canvas");
const orbBrush = orbCanvas.getContext("2d");

const STAGE_WIDTH = 1920;
const STAGE_HEIGHT = 1080;
const FUTURE_YEAR = 2126;
const SHORTEST_SHOW_SECONDS = 10 * 60;
const LONGEST_SHOW_SECONDS = 12 * 60;
const OFF_AIR_STEP = '.step[data-on-air="off"]';
const LAMP_ZOOM_SCALE = 5;
const GLITCH_MILLISECONDS = 350;
const EMPTY_MOMENT_MILLISECONDS = 120;
const MATERIALIZE_MILLISECONDS = 450;

// 마이크 소리 크기 기준. 교실에서 물결이 너무 출렁이면 QUIET를 올리고, 말해도 잘 안 움직이면 LOUD를 내림
const MICROPHONE_QUIET_LEVEL = 0.015;
const MICROPHONE_LOUD_LEVEL = 0.15;
const TREMBLE_HEIGHT = 18;
const WAVE_FLOW_SPEED = 107;
const POINT_GAP = 4;

let currentSlideNumber = 0;
let showStartTime = null;
let isTransitioning = false;

// 창 크기가 바뀔 때마다 1920x1080 무대를 화면에 꽉 맞게 늘이고 줄임
function fitStageToWindow() {
  const scale = Math.min(window.innerWidth / STAGE_WIDTH, window.innerHeight / STAGE_HEIGHT);
  stage.style.transform = `translate(-50%, -50%) scale(${scale})`;
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function stepsOf(slide) {
  return Array.from(slide.querySelectorAll(".step"));
}

function isStepShown(step) {
  return step !== null && step.classList.contains("is-shown");
}

function setStepVisible(step, isVisible) {
  step.classList.toggle("is-shown", isVisible);
}

function isOnAirNow() {
  return stage.classList.contains("is-on-air");
}

function setOnAir(isOn) {
  stage.classList.toggle("is-on-air", isOn);

  // 대기 화면에서 처음 불이 들어오는 순간부터 방송 시간을 잼
  if (isOn && showStartTime === null) {
    showStartTime = Date.now();
  }
  updateVoiceOrbVisibility();
}

// 화면을 바꾸기 전에, 바꾸고 나면 불이 켜져 있어야 하는지 미리 계산함. 불 상태가 바뀔 때만 줌 연출을 하려고
function shouldBeOnAir(slide, isOffAirStepShown) {
  return slide.dataset.onAir !== "off" && !isOffAirStepShown;
}

function playVideosIn(slide) {
  slide.querySelectorAll("video").forEach((video) => {
    if (video.closest(".media-frame").classList.contains("is-missing")) return;
    video.currentTime = 0;
    video.play().catch(() => {});
  });
}

function pauseVideosIn(slide) {
  slide.querySelectorAll("video").forEach((video) => video.pause());
}

// 영상이 길어서 중간에 멈출 일이 생길 수 있음. 처음부터 다시 틀지 않고 멈춘 곳에서 이어서 재생함
function togglePauseVideosInCurrentSlide() {
  slides[currentSlideNumber].querySelectorAll("video").forEach((video) => {
    if (video.closest(".media-frame").classList.contains("is-missing")) return;
    if (video.paused) {
      video.play().catch(() => {});
    } else {
      video.pause();
    }
  });
}

function goToSlide(nextSlideNumber, showAllSteps) {
  const leavingSlide = slides[currentSlideNumber];
  leavingSlide.classList.remove("is-active");
  pauseVideosIn(leavingSlide);

  currentSlideNumber = nextSlideNumber;
  const arrivingSlide = slides[currentSlideNumber];

  // 뒤로 돌아갈 때는 그 화면을 다 펼친 상태로 보여 줌. 앞으로 갈 때는 처음부터 하나씩
  stepsOf(arrivingSlide).forEach((step) => setStepVisible(step, showAllSteps));

  arrivingSlide.classList.add("is-active");
  updateVoiceOrbVisibility();
}

// 클래스를 뗐다가 다시 붙여야 애니메이션이 처음부터 다시 돎
function restartAnimation(element, className) {
  element.classList.remove(className);
  void element.offsetWidth;
  element.classList.add(className);
}

// TV 채널 돌릴 때처럼: 지지직 → 잠깐 빈 화면 → 신호가 잡히면서 다음 내용이 또렷해짐
// 이전엔 지지직하는 동안 다음 내용이 같이 떠서 일그러진 채로 먼저 보였음
async function playGlitchTransition(applyChange) {
  isTransitioning = true;

  restartAnimation(camera, "is-glitching");
  await wait(GLITCH_MILLISECONDS);
  camera.classList.remove("is-glitching");

  slides[currentSlideNumber].classList.remove("is-active");
  await wait(EMPTY_MOMENT_MILLISECONDS);

  applyChange();
  const arrivingSlide = slides[currentSlideNumber];
  restartAnimation(arrivingSlide, "is-materializing");
  await wait(MATERIALIZE_MILLISECONDS);
  arrivingSlide.classList.remove("is-materializing");

  isTransitioning = false;
}

function keepBetween(value, smallest, largest) {
  return Math.min(Math.max(value, smallest), largest);
}

// ON AIR 불이 화면 가운데 쪽으로 오도록 카메라를 얼마나 옮기고 키울지 계산함
function zoomedOnLampTransform() {
  const stageBox = stage.getBoundingClientRect();
  const lampBox = onAirLamp.getBoundingClientRect();
  const fitScale = stageBox.width / STAGE_WIDTH;
  const lampCenterX = (lampBox.left + lampBox.width / 2 - stageBox.left) / fitScale;
  const lampCenterY = (lampBox.top + lampBox.height / 2 - stageBox.top) / fitScale;

  // 불이 오른쪽 위 구석에 붙어 있어서 정가운데로 끌어오면 화면 바깥 검은 부분이 보임. 그래서 화면 끝을 넘지 않게 막음
  const moveX = keepBetween(
    STAGE_WIDTH / 2 - lampCenterX * LAMP_ZOOM_SCALE,
    STAGE_WIDTH - STAGE_WIDTH * LAMP_ZOOM_SCALE,
    0
  );
  const moveY = keepBetween(
    STAGE_HEIGHT / 2 - lampCenterY * LAMP_ZOOM_SCALE,
    STAGE_HEIGHT - STAGE_HEIGHT * LAMP_ZOOM_SCALE,
    0
  );
  return {
    transform: `translate(${moveX}px, ${moveY}px) scale(${LAMP_ZOOM_SCALE})`,
    lampScreenX: lampCenterX * LAMP_ZOOM_SCALE + moveX,
    lampScreenY: lampCenterY * LAMP_ZOOM_SCALE + moveY,
  };
}

function playOnAirSound() {
  onAirSound.currentTime = 0;
  onAirSound.play().catch(() => {});
}

// 불을 켤 때는 형광등처럼 지지직 두어 번 깜빡이다 켜지고, 끌 때는 한 번 버티다 툭 꺼짐
async function flickerLamp(turnOn) {
  playOnAirSound();
  if (turnOn) {
    setOnAir(true);
    await wait(70);
    setOnAir(false);
    await wait(110);
    setOnAir(true);
    await wait(50);
    setOnAir(false);
    await wait(200);
    setOnAir(true);
    restartAnimation(onAirFlash, "is-flashing");
  } else {
    setOnAir(false);
    await wait(90);
    setOnAir(true);
    await wait(70);
    setOnAir(false);
    restartAnimation(onAirFlash, "is-powering-down");
  }
}

// 이전엔 불만 바로 바꿨는데, 방송 시작과 끝은 제일 중요한 순간이라 카메라가 불빛까지 다가갔다가 빠지게 바꿈
async function playOnAirTransition(turnOn, applyChange) {
  isTransitioning = true;
  const zoom = zoomedOnLampTransform();
  const zoomedTransform = zoom.transform;
  const smoothMove = "cubic-bezier(0.65, 0, 0.35, 1)";

  // 번쩍하는 빛이 확대된 불빛 자리에서 터지게 위치를 맞춤
  onAirFlash.style.setProperty("--flash-x", `${zoom.lampScreenX}px`);
  onAirFlash.style.setProperty("--flash-y", `${zoom.lampScreenY}px`);

  await camera.animate(
    [{ transform: "none" }, { transform: zoomedTransform }],
    { duration: 800, easing: smoothMove, fill: "forwards" }
  ).finished;

  await flickerLamp(turnOn);
  await wait(450);

  // 화면이 불빛으로 꽉 차 있는 동안 뒤에서 몰래 다음 화면으로 바꿔 둠
  applyChange();

  await camera.animate(
    [{ transform: zoomedTransform }, { transform: "none" }],
    { duration: 1000, easing: smoothMove, fill: "forwards" }
  ).finished;

  camera.getAnimations().forEach((animation) => animation.cancel());
  onAirFlash.classList.remove("is-flashing", "is-powering-down");
  isTransitioning = false;
}

// 불 상태가 바뀌면 줌 연출, 그대로면 글리치 연출
async function runChange(nextIsOnAir, applyChange, isNewSlide) {
  if (nextIsOnAir !== isOnAirNow()) {
    await playOnAirTransition(nextIsOnAir, applyChange);
  } else if (isNewSlide) {
    await playGlitchTransition(applyChange);
  } else {
    applyChange();
  }

  // 화면이 다 나타난 뒤에 영상을 틀어야 안 보이는 동안 앞부분이 날아가지 않음
  if (isNewSlide) {
    playVideosIn(slides[currentSlideNumber]);
  }
}

function changeStep(slide, step, isVisible) {
  const offAirStep = slide.querySelector(OFF_AIR_STEP);
  const isOffAirStepShown = step === offAirStep ? isVisible : isStepShown(offAirStep);
  runChange(shouldBeOnAir(slide, isOffAirStepShown), () => setStepVisible(step, isVisible), false);
}

function changeSlide(nextSlideNumber, showAllSteps) {
  if (nextSlideNumber < 0 || nextSlideNumber >= slides.length) return;
  if (nextSlideNumber === currentSlideNumber) return;
  const nextSlide = slides[nextSlideNumber];
  const hasOffAirStep = nextSlide.querySelector(OFF_AIR_STEP) !== null;
  runChange(
    shouldBeOnAir(nextSlide, showAllSteps && hasOffAirStep),
    () => goToSlide(nextSlideNumber, showAllSteps),
    true
  );
}

// 아직 안 보인 단계가 있으면 그것부터 하나 보여 주고, 다 보였으면 다음 화면으로 감
function goForward() {
  if (isTransitioning) return;
  const slide = slides[currentSlideNumber];
  const hiddenStep = stepsOf(slide).find((step) => !isStepShown(step));
  if (hiddenStep) {
    changeStep(slide, hiddenStep, true);
  } else {
    changeSlide(currentSlideNumber + 1, false);
  }
}

function goBackward() {
  if (isTransitioning) return;
  const slide = slides[currentSlideNumber];
  const shownSteps = stepsOf(slide).filter(isStepShown);
  if (shownSteps.length > 0) {
    changeStep(slide, shownSteps[shownSteps.length - 1], false);
  } else {
    changeSlide(currentSlideNumber - 1, true);
  }
}

function jumpToSlide(slideNumber, showAllSteps) {
  if (isTransitioning) return;
  changeSlide(slideNumber, showAllSteps);
}

function toggleFullscreen() {
  if (document.fullscreenElement) {
    document.exitFullscreen();
  } else {
    document.documentElement.requestFullscreen();
  }
}

// 노래가 뚝 끊기면 방송 같지 않아서 천천히 키우고 천천히 줄임
function fadeMusicTo(targetVolume, onFinished) {
  clearInterval(backgroundMusic.fadeTimer);
  backgroundMusic.fadeTimer = setInterval(() => {
    const difference = targetVolume - backgroundMusic.volume;
    if (Math.abs(difference) < 0.05) {
      backgroundMusic.volume = targetVolume;
      clearInterval(backgroundMusic.fadeTimer);
      if (onFinished) onFinished();
      return;
    }
    backgroundMusic.volume += Math.sign(difference) * 0.05;
  }, 60);
}

function toggleBackgroundMusic() {
  if (backgroundMusic.paused) {
    backgroundMusic.volume = 0;
    backgroundMusic.play().then(() => fadeMusicTo(0.7)).catch(() => {
      console.warn("videos/bgm.mp3 파일이 없어서 BGM을 못 틀었음");
    });
  } else {
    fadeMusicTo(0, () => backgroundMusic.pause());
  }
}

function twoDigits(number) {
  return String(number).padStart(2, "0");
}

// 지금 날짜와 시각은 그대로 쓰고 연도만 2126년으로 바꿔서 보여 줌
function updateFutureClock() {
  const now = new Date();
  futureClock.textContent =
    `${FUTURE_YEAR}.${twoDigits(now.getMonth() + 1)}.${twoDigits(now.getDate())} ` +
    `${twoDigits(now.getHours())}:${twoDigits(now.getMinutes())}:${twoDigits(now.getSeconds())}`;
}

function updatePracticeTimer() {
  if (showStartTime === null) {
    practiceTimer.textContent = "방송 전";
    return;
  }
  const passedSeconds = Math.floor((Date.now() - showStartTime) / 1000);
  practiceTimer.textContent =
    `${twoDigits(Math.floor(passedSeconds / 60))}:${twoDigits(passedSeconds % 60)}  / 10~12분`;
  practiceTimer.classList.toggle(
    "is-in-range",
    passedSeconds >= SHORTEST_SHOW_SECONDS && passedSeconds <= LONGEST_SHOW_SECONDS
  );
  practiceTimer.classList.toggle("is-over-time", passedSeconds > LONGEST_SHOW_SECONDS);
}

// 영상 파일이 아직 없으면 빈칸에 "이 이름으로 넣으세요"를 띄움
function markMissingMedia() {
  document.querySelectorAll(".media-frame").forEach((frame) => {
    const media = frame.querySelector("img, video");
    const showMissingNote = () => frame.classList.add("is-missing");

    media.addEventListener("error", showMissingNote);
    // 스크립트가 붙기 전에 이미 실패했을 수도 있어서 한 번 더 확인함
    if (media.tagName === "IMG" && media.complete && media.naturalWidth === 0) {
      showMissingNote();
    }
    if (media.tagName === "VIDEO" && media.error) {
      showMissingNote();
    }
  });
}

// ---------- 마이크에 반응하는 바닥 물결 ----------

// 물결 두 줄. calmHeight는 조용할 때 높이, voiceHeight는 크게 말할 때 더해지는 높이, tremble은 목소리 잔떨림을 얼마나 얹을지
const seaLines = [
  { baseY: 170, calmHeight: 15, voiceHeight: 50, length: 480, tremble: 1, width: 3, color: "rgba(42, 127, 155, 0.95)" },
  { baseY: 200, calmHeight: 10, voiceHeight: 28, length: 640, tremble: 0.5, width: 2, color: "rgba(244, 185, 66, 0.5)" },
];

let microphone = null;
let isMicrophoneOn = true;
let voiceLevel = 0;
let waveLevel = 0;

async function startMicrophone() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return;
  try {
    // 영상 소리도 같이 받으려고 에코 제거, 잡음 제거, 자동 음량을 다 끔
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });
    const audioContext = new AudioContext();
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 1024;
    audioContext.createMediaStreamSource(stream).connect(analyser);
    microphone = {
      audioContext,
      analyser,
      samples: new Float32Array(analyser.fftSize),
      frequencies: new Uint8Array(analyser.frequencyBinCount),
      loudestSample: 1,
    };
  } catch (error) {
    console.warn("마이크를 못 써서 물결은 그냥 흘러가게 둠", error);
  }
}

// 브라우저는 사람이 키를 한 번 누르기 전까지 소리 처리를 멈춰 둠. 그래서 첫 키 입력 때 깨움
function wakeMicrophone() {
  if (microphone && microphone.audioContext.state === "suspended") {
    microphone.audioContext.resume();
  }
}

function isListening() {
  return microphone !== null && isMicrophoneOn;
}

// 마이크로 들어온 소리 조각들의 평균 세기를 재서 0(조용함)~1(아주 큼)으로 바꿈
function readVoiceLevel() {
  if (!isListening()) return 0;
  const samples = microphone.samples;
  microphone.analyser.getFloatTimeDomainData(samples);

  let sumOfSquares = 0;
  let loudestSample = 0.0001;
  for (const sample of samples) {
    sumOfSquares += sample * sample;
    loudestSample = Math.max(loudestSample, Math.abs(sample));
  }
  microphone.loudestSample = loudestSample;

  const loudness = Math.sqrt(sumOfSquares / samples.length);
  return keepBetween(
    (loudness - MICROPHONE_QUIET_LEVEL) / (MICROPHONE_LOUD_LEVEL - MICROPHONE_QUIET_LEVEL),
    0,
    1
  );
}

// 커질 땐 빨리 따라가고 작아질 땐 천천히. 말이 끝나도 파도처럼 천천히 가라앉게 하려고
function followLevel(currentLevel, targetLevel) {
  const speed = targetLevel > currentLevel ? 0.35 : 0.05;
  return currentLevel + (targetLevel - currentLevel) * speed;
}

// 실제 목소리 파형에서 이 위치에 해당하는 값을 꺼냄. 가장 큰 값으로 나눠서 -1~1로 맞춤
function voiceShapeAt(x) {
  if (!isListening()) return 0;
  const samples = microphone.samples;
  const index = Math.floor((x / STAGE_WIDTH) * (samples.length - 1));
  return samples[index] / microphone.loudestSample;
}

function drawSeaWaves(seconds) {
  waveBrush.clearRect(0, 0, seaWaves.width, seaWaves.height);
  for (const line of seaLines) {
    const swellHeight = line.calmHeight + waveLevel * line.voiceHeight;
    waveBrush.beginPath();
    for (let x = 0; x <= STAGE_WIDTH; x += POINT_GAP) {
      const swell = Math.sin((2 * Math.PI * (x + seconds * WAVE_FLOW_SPEED)) / line.length) * swellHeight;
      const tremble = voiceShapeAt(x) * TREMBLE_HEIGHT * line.tremble * waveLevel;
      const y = line.baseY + swell + tremble;
      if (x === 0) {
        waveBrush.moveTo(x, y);
      } else {
        waveBrush.lineTo(x, y);
      }
    }
    waveBrush.lineWidth = line.width;
    waveBrush.strokeStyle = line.color;
    waveBrush.shadowColor = line.color;
    waveBrush.shadowBlur = 6 + waveLevel * 18;
    waveBrush.stroke();
  }
}

// ---------- 가운데 목소리 반응 원 ----------

const ORB_CENTER = 450;
const ORB_RING_RADIUS = 135;
const ORB_BAR_COUNT = 64;
const ORB_BAR_LONGEST = 110;
const RIPPLE_LIFETIME_SECONDS = 1.6;
const RIPPLE_FARTHEST_RADIUS = 440;
const RIPPLE_GAP_SECONDS = 0.4;
const LOUD_ENOUGH_FOR_RIPPLE = 0.35;
const LOUD_ENOUGH_FOR_GOLD = 0.7;

// 막대는 왼쪽 절반만 계산하고 오른쪽은 거울처럼 똑같이 그림. 좌우가 맞아야 더 정돈돼 보임
const orbBarLevels = new Array(ORB_BAR_COUNT / 2).fill(0);
let ripples = [];
let lastRippleSecond = 0;

// 말하는 화면이고 방송 중일 때만 가운데 원이 나타남
function updateVoiceOrbVisibility() {
  const isTalkSlide = slides[currentSlideNumber].hasAttribute("data-talk");
  voiceOrb.classList.toggle("is-shown", isTalkSlide && isOnAirNow());
}

// 청록(조용함)에서 금빛(큼)으로 섞은 색을 만듦. 물결 두 줄 색이랑 맞춤
function mixOrbColor(goldAmount, opacity) {
  const red = Math.round(95 + (244 - 95) * goldAmount);
  const green = Math.round(212 + (185 - 212) * goldAmount);
  const blue = Math.round(240 + (66 - 240) * goldAmount);
  return `rgba(${red}, ${green}, ${blue}, ${opacity})`;
}

// 목소리를 낮은 소리부터 높은 소리까지 나눠서, 각 높이의 소리가 얼마나 큰지 0~1로 꺼냄
function readPitchLoudness(barIndex) {
  if (!isListening()) return 0;
  // 사람 목소리는 대략 100Hz~4000Hz라서 그 구간만 막대에 나눠 씀
  const lowestBin = 2;
  const highestBin = 90;
  const bin = lowestBin + Math.floor((barIndex / orbBarLevels.length) * (highestBin - lowestBin));
  return microphone.frequencies[bin] / 255;
}

function drawVoiceOrb(seconds) {
  if (!voiceOrb.classList.contains("is-shown")) {
    ripples = [];
    return;
  }
  if (isListening()) {
    microphone.analyser.getByteFrequencyData(microphone.frequencies);
  }
  orbBrush.clearRect(0, 0, orbCanvas.width, orbCanvas.height);

  // 조용할 때도 죽어 보이지 않게 천천히 숨 쉬듯 커졌다 작아짐
  const breathing = Math.sin(seconds * 1.4) * 4;
  const ringRadius = ORB_RING_RADIUS + breathing + voiceLevel * 18;

  orbBrush.beginPath();
  orbBrush.arc(ORB_CENTER, ORB_CENTER, ringRadius, 0, Math.PI * 2);
  orbBrush.lineWidth = 3;
  orbBrush.strokeStyle = mixOrbColor(voiceLevel * 0.5, 0.9);
  orbBrush.stroke();

  // 교실 잡음에 막대가 계속 튀지 않게, 전체 목소리 크기(voiceLevel)를 곱해서 말할 때만 길어지게 함
  orbBarLevels.forEach((barLevel, index) => {
    const target = readPitchLoudness(index) ** 2 * Math.min(1, voiceLevel * 1.5);
    orbBarLevels[index] = followLevel(barLevel, target);
  });

  orbBrush.lineCap = "round";
  orbBrush.lineWidth = 6;
  for (let barNumber = 0; barNumber < ORB_BAR_COUNT; barNumber++) {
    const mirroredIndex = barNumber < orbBarLevels.length ? barNumber : ORB_BAR_COUNT - 1 - barNumber;
    const barLevel = orbBarLevels[mirroredIndex];
    const angle = -Math.PI / 2 + (barNumber / ORB_BAR_COUNT) * Math.PI * 2;
    const startRadius = ringRadius + 14;
    const endRadius = startRadius + 6 + barLevel * ORB_BAR_LONGEST;

    orbBrush.beginPath();
    orbBrush.moveTo(ORB_CENTER + Math.cos(angle) * startRadius, ORB_CENTER + Math.sin(angle) * startRadius);
    orbBrush.lineTo(ORB_CENTER + Math.cos(angle) * endRadius, ORB_CENTER + Math.sin(angle) * endRadius);
    orbBrush.strokeStyle = mixOrbColor(barLevel, 0.4 + barLevel * 0.6);
    orbBrush.stroke();
  }

  // 크게 말하는 순간마다 물에 돌 던진 것처럼 동그란 파동을 하나씩 내보냄
  if (voiceLevel > LOUD_ENOUGH_FOR_RIPPLE && seconds - lastRippleSecond > RIPPLE_GAP_SECONDS) {
    ripples.push({ bornSecond: seconds, isLoud: voiceLevel > LOUD_ENOUGH_FOR_GOLD });
    lastRippleSecond = seconds;
  }
  ripples = ripples.filter((ripple) => seconds - ripple.bornSecond < RIPPLE_LIFETIME_SECONDS);

  orbBrush.lineWidth = 2;
  for (const ripple of ripples) {
    const progress = (seconds - ripple.bornSecond) / RIPPLE_LIFETIME_SECONDS;
    const radius = ringRadius + progress * (RIPPLE_FARTHEST_RADIUS - ringRadius);
    orbBrush.beginPath();
    orbBrush.arc(ORB_CENTER, ORB_CENTER, radius, 0, Math.PI * 2);
    orbBrush.strokeStyle = mixOrbColor(ripple.isLoud ? 1 : 0, (1 - progress) * 0.6);
    orbBrush.stroke();
  }
}

// 물결, 가운데 원, HUD 막대를 한 번에 그림. 목소리 크기는 여기서 한 번만 재서 셋이 같이 씀
function animateEveryFrame(time) {
  const seconds = time / 1000;
  voiceLevel = followLevel(voiceLevel, readVoiceLevel());
  // 물결은 방송 중일 때만 목소리를 따라감. HUD 막대는 대기 화면에서도 움직여서 마이크 확인용으로 씀
  waveLevel = followLevel(waveLevel, isOnAirNow() ? voiceLevel : 0);

  drawSeaWaves(seconds);
  drawVoiceOrb(seconds);
  updateSignalBars();
  requestAnimationFrame(animateEveryFrame);
}

// 마이크가 켜져 있으면 HUD 막대 5개가 음량계가 됨. 마이크가 없으면 원래처럼 깜빡이기만 함
function updateSignalBars() {
  signalBarsBox.classList.toggle("is-meter", isListening());
  if (!isListening()) return;
  const litCount = Math.max(1, Math.round(voiceLevel * signalBars.length));
  signalBars.forEach((bar, index) => bar.classList.toggle("is-lit", index < litCount));
}

function hideCursorWhenIdle() {
  let idleTimer;
  document.addEventListener("mousemove", () => {
    document.body.style.cursor = "";
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => (document.body.style.cursor = "none"), 2000);
  });
}

document.addEventListener("keydown", (event) => {
  wakeMicrophone();
  const key = event.key;
  if (key === "ArrowRight" || key === " " || key === "PageDown" || key === "Enter") {
    event.preventDefault();
    goForward();
  } else if (key === "ArrowLeft" || key === "PageUp" || key === "Backspace") {
    event.preventDefault();
    goBackward();
  } else if (key === "Home") {
    jumpToSlide(0, false);
  } else if (key === "End") {
    jumpToSlide(slides.length - 1, true);
  } else if (key === "f" || key === "F" || key === "ㄹ") {
    toggleFullscreen();
  } else if (key === "b" || key === "B" || key === "ㅠ") {
    toggleBackgroundMusic();
  } else if (key === "p" || key === "P" || key === "ㅔ") {
    togglePauseVideosInCurrentSlide();
  } else if (key === "t" || key === "T" || key === "ㅅ") {
    practiceTimer.classList.toggle("is-visible");
  } else if (key === "m" || key === "M" || key === "ㅡ") {
    isMicrophoneOn = !isMicrophoneOn;
  }
});

stage.addEventListener("click", () => {
  wakeMicrophone();
  goForward();
});
window.addEventListener("resize", fitStageToWindow);

fitStageToWindow();
markMissingMedia();
slides[0].classList.add("is-active");
setOnAir(shouldBeOnAir(slides[0], false));
startMicrophone();
requestAnimationFrame(animateEveryFrame);
updateFutureClock();
setInterval(updateFutureClock, 1000);
setInterval(updatePracticeTimer, 500);
hideCursorWhenIdle();
