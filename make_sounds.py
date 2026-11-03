"""
ON AIR 켜짐, 꺼짐, 화면 넘김 효과음을 직접 합성해서 videos 폴더에 wav로 저장함.
숫자를 바꾸고 다시 돌리면 소리가 바뀜.  python make_sounds.py
"""
import wave
from pathlib import Path

import numpy as np

SAMPLE_RATE = 44100
OUTPUT_FOLDER = Path(__file__).parent / "videos"

# 지지직 노이즈가 돌릴 때마다 달라지지 않게 씨앗을 고정함. 2126년 방송이라 2126
random = np.random.default_rng(2126)

# script.js 의 flickerLamp 에서 불이 켜지고 꺼지는 순간(초). 소리를 불빛 깜빡임에 맞추려고 그대로 옮겨 옴
LAMP_ON_MOMENTS = [0.0, 0.18, 0.43]
LAMP_OFF_MOMENTS = [0.0, 0.09, 0.16]

# 제일 큰 소리가 어디까지 올라갈지. 1.0이 최대. 사람 목소리를 덮지 않게 작게 잡음
ON_AIR_LOUDNESS = 0.45
GLITCH_LOUDNESS = 0.12


def time_axis(seconds):
    return np.arange(int(SAMPLE_RATE * seconds)) / SAMPLE_RATE


def silence(seconds):
    return np.zeros(int(SAMPLE_RATE * seconds))


# 높이가 점점 바뀌는 소리. 주파수를 매 순간 더해 가야 소리가 끊기지 않고 미끄러지듯 올라가거나 내려감
def sliding_tone(start_hertz, end_hertz, seconds):
    time = time_axis(seconds)
    hertz = start_hertz * (end_hertz / start_hertz) ** (time / seconds)
    phase = 2 * np.pi * np.cumsum(hertz) / SAMPLE_RATE
    # 사인파 하나만 있으면 너무 깨끗해서 배수 소리를 섞어 기계가 웅웅대는 느낌을 냄
    return np.sin(phase) + 0.5 * np.sin(2 * phase) + 0.25 * np.sin(3 * phase)


# 처음에 확 커졌다가 서서히 사라지는 모양. 종이나 전자음이 울리고 잦아드는 느낌
def ring_out(seconds, how_fast):
    return np.exp(-how_fast * time_axis(seconds))


def ding(hertz, seconds):
    time = time_axis(seconds)
    bright = np.sin(2 * np.pi * hertz * time) + 0.35 * np.sin(2 * np.pi * hertz * 1.5 * time)
    return bright * ring_out(seconds, 5)


# 스위치 딸깍. 아주 짧은 노이즈를 차이값으로 바꾸면 낮은 소리가 빠져서 날카로운 딸깍이 됨
def click(seconds=0.015):
    noise = np.diff(random.uniform(-1, 1, int(SAMPLE_RATE * seconds) + 1))
    return noise * ring_out(seconds, 300)


def thump(seconds=0.25):
    return np.sin(2 * np.pi * 70 * time_axis(seconds)) * ring_out(seconds, 18)


# 디지털 노이즈. 같은 값을 몇 칸씩 붙잡아 두면 해상도가 낮은 옛날 기계처럼 거칠어짐
def crushed_noise(seconds, hold_samples):
    rough = random.uniform(-1, 1, int(SAMPLE_RATE * seconds) // hold_samples + 1)
    return np.repeat(rough, hold_samples)[: int(SAMPLE_RATE * seconds)]


def place(track, sound, at_seconds, loudness=1.0):
    start = int(SAMPLE_RATE * at_seconds)
    end = min(len(track), start + len(sound))
    track[start:end] += loudness * sound[: end - start]


# 앞뒤를 아주 살짝 줄여서 틀고 끝날 때 툭 하는 잡음이 안 나게 함
def soften_edges(track, seconds=0.005):
    edge = int(SAMPLE_RATE * seconds)
    ramp = np.linspace(0, 1, edge)
    track[:edge] *= ramp
    track[-edge:] *= ramp[::-1]
    return track


def save(file_name, track, loudness):
    track = soften_edges(track)
    track = track / np.max(np.abs(track)) * loudness
    samples = (track * 32767).astype(np.int16)
    with wave.open(str(OUTPUT_FOLDER / file_name), "wb") as file:
        file.setnchannels(1)
        file.setsampwidth(2)
        file.setframerate(SAMPLE_RATE)
        file.writeframes(samples.tobytes())
    print(f"{file_name}  {len(track) / SAMPLE_RATE:.2f}초")


def make_on_air_on():
    track = silence(1.6)
    lit_moment = LAMP_ON_MOMENTS[-1]

    # 불이 완전히 들어올 때까지 낮은 웅 소리가 올라감
    rising = sliding_tone(55, 110, lit_moment)
    rising *= np.linspace(0.2, 1, len(rising))
    place(track, rising, 0, 0.5)

    # 불이 들어온 뒤에도 웅 소리가 잠깐 남았다가 사라짐
    place(track, sliding_tone(110, 110, 1.1) * ring_out(1.1, 4), lit_moment, 0.5)

    for moment in LAMP_ON_MOMENTS:
        place(track, click(), moment, 0.6)

    # 불이 들어오는 순간 맑은 띵. 조금 늦게 작은 띵을 한 번 더 넣어서 넓은 방에 울리는 느낌을 냄
    place(track, ding(1318.5, 1.1), lit_moment, 0.8)
    place(track, ding(1318.5, 1.0), lit_moment + 0.12, 0.25)
    return track


def make_on_air_off():
    track = silence(1.4)
    out_moment = LAMP_OFF_MOMENTS[-1]

    for moment in LAMP_OFF_MOMENTS:
        place(track, click(), moment, 0.6)

    # 불이 꺼지면 전원이 빠지듯 웅 소리가 낮아지면서 사라짐
    place(track, sliding_tone(110, 35, 1.1) * ring_out(1.1, 3), out_moment, 0.6)
    place(track, thump(), out_moment, 0.7)

    # 켜질 때의 띵을 낮고 짧게 한 번. 같은 방송 소리라는 느낌을 주려고
    place(track, ding(659.3, 0.6), out_moment, 0.3)
    return track


def make_glitch():
    # style.css 의 화면 지지직(0.35초)이랑 길이를 맞춤
    seconds = 0.35
    track = silence(seconds)

    # 화면 지지직이 뚝뚝 끊기며 움직여서 소리도 짧은 토막으로 켜졌다 꺼졌다 하게 함
    piece_seconds = 0.025
    for piece_start in np.arange(0, seconds, piece_seconds):
        if random.random() < 0.3:
            continue
        hold_samples = int(random.choice([4, 8, 16]))
        place(track, crushed_noise(piece_seconds, hold_samples), piece_start, random.uniform(0.3, 1.0))

    # 처음과 끝에 디지털 삑. 신호가 끊겼다가 다시 잡히는 느낌
    beep = np.sign(np.sin(2 * np.pi * 1800 * time_axis(0.04))) * ring_out(0.04, 40)
    place(track, beep, 0, 0.35)
    place(track, beep, seconds - 0.06, 0.25)
    return track


save("sfx-onair-on.wav", make_on_air_on(), ON_AIR_LOUDNESS)
save("sfx-onair-off.wav", make_on_air_off(), ON_AIR_LOUDNESS)
save("sfx-glitch.wav", make_glitch(), GLITCH_LOUDNESS)
