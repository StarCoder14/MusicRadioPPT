"""방송 화면(index.html)을 한 장씩 사진으로 찍어서 제출용 pptx로 묶음.
영상은 빈 네모로 자리만 표시하고, 노래랑 효과음 같은 소리는 하나도 안 넣음.
마지막 장에는 영상까지 다 나오는 HTML 방송 화면 링크를 걺.
HTML을 고친 뒤에 python make_pptx.py 를 다시 돌리면 새로 뽑힘."""

import subprocess
import tempfile
from pathlib import Path

from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.util import Emu, Pt

PROJECT_FOLDER = Path(__file__).resolve().parent
OUTPUT_FILE = PROJECT_FOLDER / "타임캡슐라디오_제출용.pptx"
CHROME = Path(r"C:\Program Files\Google\Chrome\Application\chrome.exe")

# 깃허브 페이지로 열리는 HTML 방송 화면 주소
WEB_SHOW_LINK = "https://starcoder14.github.io/MusicRadioPPT/"

# 화면 크기가 1920x1080이라 pptx도 같은 16:9로 맞춤. 1픽셀을 9525 EMU로 두면 13.33인치 x 7.5인치가 됨
PIXEL = 9525
SCREEN_WIDTH = 1920
SCREEN_HEIGHT = 1080

AMBER = RGBColor(0xF4, 0xB9, 0x42)
MUTED = RGBColor(0x92, 0xA2, 0xB7)
NIGHT = RGBColor(0x0A, 0x0F, 0x1D)

# 찍을 때만 잠깐 쓰는 페이지. 주소 끝 #번호 를 보고 그 화면을 바로 띄움
CAPTURE_SCRIPT = """
<script>
  // script.js 안의 slides, setOnAir 같은 이름을 그대로 빌려 씀. 넘어가는 연출 없이 바로 그 화면만 켬
  const wantedSlideNumber = Number(location.hash.slice(1));
  slides[0].classList.remove("is-active");
  slides[wantedSlideNumber].classList.add("is-active");
  setOnAir(shouldBeOnAir(slides[wantedSlideNumber], false));
  document.body.style.cursor = "none";
  // 위아래로 움직이는 스캔 줄은 사진으로 멈추면 글씨를 가로지르는 검은 줄처럼 보여서 뺌
  document.getElementById("scan-line").style.display = "none";

  // 영상 파일을 넣기 전처럼 빈 네모로 바꿔서 자리만 보여 줌. 파일 이름 대신 어디서 볼 수 있는지 적음
  document.querySelectorAll(".media-frame").forEach((frame) => {
    if (frame.querySelector("video") === null) return;
    frame.classList.add("is-missing");
    frame.querySelector(".missing-note code").textContent = "영상은 마지막 장 링크에서 재생";
  });

  // 노래는 화면에 보이는 게 없어서 제목 아래에 따로 적어 둠
  const songNote = document.createElement("p");
  songNote.textContent = "이 화면에서 노래가 나옴 (저작권 때문에 파일에는 안 넣음)";
  songNote.style.cssText =
    "margin-top: 36px; padding: 12px 30px; font-size: 26px; color: #f4b942;" +
    "border: 2px dashed rgba(244, 185, 66, 0.45); border-radius: 14px;";
  document.querySelector('audio[src="videos/music.mp3"]').parentElement.appendChild(songNote);
</script>
"""


def count_slides(page):
    return page.count('<section class="slide')


def take_screenshot(capture_page, slide_number, picture_file, chrome_profile):
    subprocess.run(
        [
            str(CHROME),
            "--headless=new",
            "--hide-scrollbars",
            "--force-device-scale-factor=1",
            "--mute-audio",
            f"--user-data-dir={chrome_profile}",
            f"--window-size={SCREEN_WIDTH},{SCREEN_HEIGHT}",
            # 글꼴을 인터넷에서 받아 오고 화면이 다 나타날 때까지 기다리게 시간을 넉넉히 줌
            "--virtual-time-budget=4000",
            f"--screenshot={picture_file}",
            capture_page.as_uri() + f"#{slide_number}",
        ],
        check=True,
        capture_output=True,
    )


def box(slide, shape_type, left, top, width, height):
    return slide.shapes.add_shape(
        shape_type, Emu(left * PIXEL), Emu(top * PIXEL), Emu(width * PIXEL), Emu(height * PIXEL)
    )


def write_centered(shape, text, size, color, bold):
    text_box = shape.text_frame
    text_box.vertical_anchor = MSO_ANCHOR.MIDDLE
    paragraph = text_box.paragraphs[0]
    paragraph.alignment = PP_ALIGN.CENTER
    run = paragraph.add_run()
    run.text = text
    run.font.name = "맑은 고딕"
    run.font.size = Pt(size)
    run.font.bold = bold
    run.font.color.rgb = color


def add_web_show_button(slide):
    width, height = 600, 90
    left = (SCREEN_WIDTH - width) // 2
    button = box(slide, MSO_SHAPE.ROUNDED_RECTANGLE, left, 780, width, height)
    button.fill.solid()
    button.fill.fore_color.rgb = NIGHT
    button.line.color.rgb = AMBER
    button.line.width = Pt(2)
    button.shadow.inherit = False
    # 링크는 글씨 말고 도형에만 걺. 글씨에 걸면 파워포인트가 파란 밑줄 글씨로 바꿔 버림
    button.click_action.hyperlink.address = WEB_SHOW_LINK
    write_centered(button, "방송 화면(HTML)으로 보기", 26, AMBER, True)

    # 처음 보는 사람은 넘기는 키를 모르니까 버튼 바로 아래에 알려 줌
    guide = box(slide, MSO_SHAPE.RECTANGLE, left - 100, 880, width + 200, 44)
    guide.fill.background()
    guide.line.fill.background()
    guide.shadow.inherit = False
    write_centered(guide, "오른쪽 방향키로 넘기기, 스페이스로 영상 재생", 16, MUTED, False)


def main():
    page = (PROJECT_FOLDER / "index.html").read_text(encoding="utf-8")
    slide_count = count_slides(page)

    # 찍는 페이지는 index.html 옆에 둬야 style.css, videos 폴더를 그대로 찾음
    capture_page = PROJECT_FOLDER / "_capture.html"
    capture_page.write_text(page.replace("</body>", CAPTURE_SCRIPT + "</body>"), encoding="utf-8")

    presentation = Presentation()
    presentation.slide_width = Emu(SCREEN_WIDTH * PIXEL)
    presentation.slide_height = Emu(SCREEN_HEIGHT * PIXEL)
    blank_layout = presentation.slide_layouts[6]

    with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as working_folder:
        working_folder = Path(working_folder)
        try:
            for slide_number in range(slide_count):
                picture_file = working_folder / f"slide{slide_number}.png"
                take_screenshot(capture_page, slide_number, picture_file, working_folder / "chrome")
                slide = presentation.slides.add_slide(blank_layout)
                slide.shapes.add_picture(str(picture_file), 0, 0, presentation.slide_width, presentation.slide_height)
                print("찍음:", slide_number)
        finally:
            capture_page.unlink()

    add_web_show_button(presentation.slides[-1])
    presentation.save(OUTPUT_FILE)
    print("저장함:", OUTPUT_FILE, f"({slide_count}장)")


if __name__ == "__main__":
    main()
