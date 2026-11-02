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

const WAVE_FLOW_SPEED = 107;
const POINT_GAP = 4;
const MUSIC_VOLUME = 0.7;
const MUSIC_FADE_IN_MILLISECONDS = 2000;
const MUSIC_FADE_OUT_MILLISECONDS = 2500;

let currentSlideNumber = 0;
let showStartTime = null;
let isTransitioning = false;
let isMusicWanted = false;

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
}

// 화면을 바꾸기 전에, 바꾸고 나면 불이 켜져 있어야 하는지 미리 계산함. 불 상태가 바뀔 때만 줌 연출을 하려고
function shouldBeOnAir(slide, isOffAirStepShown) {
  return slide.dataset.onAir !== "off" && !isOffAirStepShown;
}

// 화면에 들어오면 바로 틀지 않고 첫 장면에 세워 둠. 말로 소개하다가 원하는 순간에 스페이스로 틀려고
function rewindVideosIn(slide) {
  slide.querySelectorAll("video").forEach((video) => {
    video.pause();
    video.currentTime = 0;
  });
}

function pauseVideosIn(slide) {
  slide.querySelectorAll("video").forEach((video) => video.pause());
}

// 처음부터 다시 틀지 않고 멈춘 곳에서 이어서 재생함. 끝까지 본 영상은 play()가 알아서 처음부터 틀어 줌
function togglePauseVideosInCurrentSlide() {
  // 넘어가는 연출 중에 틀면 화면이 안 보이는 동안 앞부분이 날아감
  if (isTransitioning) return;
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
  rewindVideosIn(arrivingSlide);

  arrivingSlide.classList.add("is-active");
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

  const isStartingShow = turnOn && currentSlideNumber === 0;
  await flickerLamp(turnOn);
  // 대기 화면에서 방송을 시작하는 순간에만 BGM이 같이 켜짐. 클로징에서 뒤로 돌아갈 때 불이 다시 켜져도 노래는 안 켜짐
  if (isStartingShow && !isMusicWanted) {
    startBackgroundMusic();
  }
  // 불이 꺼지면 BGM도 같이 서서히 꺼짐. 마지막에 B 누르는 걸 깜빡해도 노래가 계속 나오지 않게
  if (!turnOn && isMusicWanted) {
    stopBackgroundMusic();
  }
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

// 노래가 뚝 끊기면 방송 같지 않아서 시간을 정해 두고 천천히 키우고 천천히 줄임
// 이전엔 0.05씩 일정하게 바꿨는데, 귀에는 끝부분에서 뚝 끊기는 것처럼 들려서 제곱근 단위로 바꾸는 방식으로 고침
function fadeMusicTo(targetVolume, durationMilliseconds, onFinished) {
  cancelAnimationFrame(backgroundMusic.fadeFrame);
  const startLoudness = Math.sqrt(backgroundMusic.volume);
  const targetLoudness = Math.sqrt(targetVolume);
  const startTime = performance.now();

  const fadeOneFrame = (now) => {
    const progress = Math.min(1, (now - startTime) / durationMilliseconds);
    const loudness = startLoudness + (targetLoudness - startLoudness) * progress;
    backgroundMusic.volume = loudness * loudness;
    if (progress < 1) {
      backgroundMusic.fadeFrame = requestAnimationFrame(fadeOneFrame);
    } else if (onFinished) {
      onFinished();
    }
  };
  backgroundMusic.fadeFrame = requestAnimationFrame(fadeOneFrame);
}

function startBackgroundMusic() {
  isMusicWanted = true;
  // 줄어들던 중에 다시 켜면 처음부터 다시 틀지 않고 그 자리에서 다시 커짐
  if (!backgroundMusic.paused) {
    fadeMusicTo(MUSIC_VOLUME, MUSIC_FADE_IN_MILLISECONDS);
    return;
  }
  backgroundMusic.currentTime = 0;
  backgroundMusic.volume = 0;
  backgroundMusic.play()
    .then(() => fadeMusicTo(MUSIC_VOLUME, MUSIC_FADE_IN_MILLISECONDS))
    .catch(() => console.warn("videos 폴더에 bgm 파일이 없어서 BGM을 못 틀었음"));
}

function stopBackgroundMusic() {
  isMusicWanted = false;
  fadeMusicTo(0, MUSIC_FADE_OUT_MILLISECONDS, () => {
    // 줄어드는 동안 B를 다시 눌러서 켜졌으면 멈추지 않음
    if (!isMusicWanted) backgroundMusic.pause();
  });
}

function toggleBackgroundMusic() {
  if (isMusicWanted) {
    stopBackgroundMusic();
  } else {
    startBackgroundMusic();
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

// ---------- 바닥 물결 ----------

// 물결 두 줄. height는 출렁이는 높이, length는 물결 한 번의 길이
const seaLines = [
  { baseY: 170, height: 15, length: 480, width: 3, color: "rgba(42, 127, 155, 0.95)" },
  { baseY: 200, height: 10, length: 640, width: 2, color: "rgba(244, 185, 66, 0.5)" },
];

function drawSeaWaves(time) {
  const seconds = time / 1000;
  waveBrush.clearRect(0, 0, seaWaves.width, seaWaves.height);
  for (const line of seaLines) {
    waveBrush.beginPath();
    for (let x = 0; x <= STAGE_WIDTH; x += POINT_GAP) {
      const y = line.baseY + Math.sin((2 * Math.PI * (x + seconds * WAVE_FLOW_SPEED)) / line.length) * line.height;
      if (x === 0) {
        waveBrush.moveTo(x, y);
      } else {
        waveBrush.lineTo(x, y);
      }
    }
    waveBrush.lineWidth = line.width;
    waveBrush.strokeStyle = line.color;
    waveBrush.shadowColor = line.color;
    waveBrush.shadowBlur = 6;
    waveBrush.stroke();
  }
  requestAnimationFrame(drawSeaWaves);
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
  const key = event.key;
  if (key === "ArrowRight" || key === "PageDown" || key === "Enter") {
    event.preventDefault();
    goForward();
  } else if (key === " ") {
    // 스페이스는 영상 재생, 멈춤 전용. 영상 없는 화면에서 실수로 눌러도 안 넘어감
    event.preventDefault();
    togglePauseVideosInCurrentSlide();
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
  }
});

stage.addEventListener("click", goForward);
window.addEventListener("resize", fitStageToWindow);

fitStageToWindow();
markMissingMedia();
slides[0].classList.add("is-active");
setOnAir(shouldBeOnAir(slides[0], false));
requestAnimationFrame(drawSeaWaves);
updateFutureClock();
setInterval(updateFutureClock, 1000);
setInterval(updatePracticeTimer, 500);
hideCursorWhenIdle();
