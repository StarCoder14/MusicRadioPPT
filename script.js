const stage = document.getElementById("stage");
const slides = Array.from(document.querySelectorAll(".slide"));
const cornerLabel = document.getElementById("corner-label");
const futureClock = document.getElementById("future-clock");
const practiceTimer = document.getElementById("practice-timer");
const backgroundMusic = document.getElementById("background-music");

const STAGE_WIDTH = 1920;
const STAGE_HEIGHT = 1080;
const FUTURE_YEAR = 2126;
const SHORTEST_SHOW_SECONDS = 10 * 60;
const LONGEST_SHOW_SECONDS = 12 * 60;

let currentSlideNumber = 0;
let showStartTime = null;

// 창 크기가 바뀔 때마다 1920x1080 무대를 화면에 꽉 맞게 늘이고 줄임
function fitStageToWindow() {
  const scale = Math.min(window.innerWidth / STAGE_WIDTH, window.innerHeight / STAGE_HEIGHT);
  stage.style.transform = `translate(-50%, -50%) scale(${scale})`;
}

function stepsOf(slide) {
  return Array.from(slide.querySelectorAll(".step"));
}

function shownStepsOf(slide) {
  return stepsOf(slide).filter((step) => step.classList.contains("is-shown"));
}

function setStepVisible(step, isVisible) {
  step.classList.toggle("is-shown", isVisible);
}

function updateOnAirLamp() {
  const slide = slides[currentSlideNumber];
  let isOnAir = slide.dataset.onAir !== "off";
  const turnsOffAirStep = slide.querySelector('.step[data-on-air="off"]');
  if (turnsOffAirStep && turnsOffAirStep.classList.contains("is-shown")) {
    isOnAir = false;
  }
  stage.classList.toggle("is-on-air", isOnAir);

  // 대기 화면에서 처음 넘어가는 순간부터 방송 시간을 잼
  if (isOnAir && showStartTime === null) {
    showStartTime = Date.now();
  }
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

function goToSlide(nextSlideNumber, showAllSteps = false) {
  if (nextSlideNumber < 0 || nextSlideNumber >= slides.length) return;

  const leavingSlide = slides[currentSlideNumber];
  leavingSlide.classList.remove("is-active");
  pauseVideosIn(leavingSlide);

  currentSlideNumber = nextSlideNumber;
  const arrivingSlide = slides[currentSlideNumber];

  // 뒤로 돌아갈 때는 그 화면을 다 펼친 상태로 보여 줌. 앞으로 갈 때는 처음부터 하나씩
  stepsOf(arrivingSlide).forEach((step) => setStepVisible(step, showAllSteps));

  arrivingSlide.classList.add("is-active");
  cornerLabel.textContent = arrivingSlide.dataset.corner || "";
  playVideosIn(arrivingSlide);
  updateOnAirLamp();
}

// 아직 안 보인 단계가 있으면 그것부터 하나 보여 주고, 다 보였으면 다음 화면으로 감
function goForward() {
  const slide = slides[currentSlideNumber];
  const hiddenStep = stepsOf(slide).find((step) => !step.classList.contains("is-shown"));
  if (hiddenStep) {
    setStepVisible(hiddenStep, true);
    updateOnAirLamp();
  } else {
    goToSlide(currentSlideNumber + 1);
  }
}

function goBackward() {
  const slide = slides[currentSlideNumber];
  const shownSteps = shownStepsOf(slide);
  if (shownSteps.length > 0) {
    setStepVisible(shownSteps[shownSteps.length - 1], false);
    updateOnAirLamp();
  } else {
    goToSlide(currentSlideNumber - 1, true);
  }
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
    `${FUTURE_YEAR}. ${twoDigits(now.getMonth() + 1)}. ${twoDigits(now.getDate())}  ` +
    `${twoDigits(now.getHours())}:${twoDigits(now.getMinutes())}`;
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

// 사진이나 영상 파일이 아직 없으면 빈칸에 "이 이름으로 넣으세요"를 띄움
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
  if (key === "ArrowRight" || key === " " || key === "PageDown" || key === "Enter") {
    event.preventDefault();
    goForward();
  } else if (key === "ArrowLeft" || key === "PageUp" || key === "Backspace") {
    event.preventDefault();
    goBackward();
  } else if (key === "Home") {
    goToSlide(0);
  } else if (key === "End") {
    goToSlide(slides.length - 1, true);
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
goToSlide(0);
updateFutureClock();
setInterval(updateFutureClock, 1000);
setInterval(updatePracticeTimer, 500);
hideCursorWhenIdle();
