import os
import sys
import tempfile
from pathlib import Path

ENGINE = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ENGINE))
os.environ.setdefault("FLOWCRAFT_DATA", tempfile.mkdtemp(prefix="flowcraft-test-"))

import pytest  # noqa: E402

from modules.models import Character, Project, RenderSettings, VisualBible  # noqa: E402
from modules.script_parser import parse_script  # noqa: E402

SCRIPT = """# Ulug'tog', 1391 | Yurish
1391-yil, Dashti Qipchoq cho'llari. Qo'shin uch oydirki yo'lda, ammo dushman hali ko'rinmaydi.
Sanjar otini sug'oradi va ufqqa qaraydi. Gulxan atrofida askarlar non bo'lishadi.
Amir xaritaga uzoq tikiladi. Qum bo'roni yaqinlashmoqda, otlar bezovta.

# Tong
Tong otmasdan karnay chalinadi. Askarlar sovuq yerdan turishib egarlarni bog'lashadi.
Yuzboshi qatorlarni sanaydi, hech kim kechikmaydi. Sanjar sovuq suv bilan yuzini yuvadi.

# Jang
Qo'shin yana yo'lga chiqadi, chang osmonga ko'tariladi. Uzoqda dushman bayroqlari ko'rinadi.
"""


def make_project(script: str = SCRIPT, **render) -> Project:
    parsed = parse_script(script)
    return Project(
        project_id="test",
        title="Test",
        hook_video_count=2,
        bible=VisualBible(
            world="14th-century Timurid Central Asia",
            characters=[Character(name="Sanjar", dna="22-year-old Timurid soldier, weathered tan skin, "
                                                     "short dark beard, worn leather lamellar armor")],
        ),
        chapters=parsed.chapters,
        scenes=parsed.scenes,
        render=RenderSettings(**render) if render else RenderSettings(),
    )


@pytest.fixture
def project() -> Project:
    return make_project()
