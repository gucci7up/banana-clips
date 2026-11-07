import os
import subprocess
import tempfile
from main import (
    compute_semantic_embedding_384,
    detect_gaming_events,
    detect_hardware_profile,
    detect_scenes_ffmpeg,
    detect_silences_and_energy,
    probe_video_file,
)


def test_hardware_detection():
    hw = detect_hardware_profile()
    assert hw["profile"] in ("CPU_ONLY", "NVIDIA_LOW_VRAM", "NVIDIA_HIGH_VRAM")
    assert "recommended_whisper_model" in hw


def test_semantic_embedding_similarity():
    v_query = compute_semantic_embedding_384("Encuentra cuando el presentador se ríe")
    v_match = compute_semantic_embedding_384("En este momento el presentador se ríe a carcajadas del chiste")
    v_unrelated = compute_semantic_embedding_384("Configuración técnica de servidores en la nube")

    assert len(v_query) == 384
    sim_match = sum(a * b for a, b in zip(v_query, v_match))
    sim_unrelated = sum(a * b for a, b in zip(v_query, v_unrelated))
    assert sim_match > sim_unrelated


def test_ffprobe_and_scenes_on_real_video():
    with tempfile.TemporaryDirectory() as tmpdir:
        video_path = os.path.join(tmpdir, "sample.mp4")
        subprocess.run(
            [
                "ffmpeg",
                "-y",
                "-f",
                "lavfi",
                "-i",
                "testsrc=duration=6:size=640x360:rate=24",
                "-f",
                "lavfi",
                "-i",
                "sine=frequency=440:duration=6",
                "-c:v",
                "libx264",
                "-pix_fmt",
                "yuv420p",
                "-c:a",
                "aac",
                video_path,
            ],
            check=True,
            capture_output=True,
        )
        meta = probe_video_file(video_path)
        assert meta["width"] == 640
        assert meta["height"] == 360
        assert meta["durationSeconds"] >= 5.5
        assert meta["hasAudio"] is True

        vad = detect_silences_and_energy(video_path, meta["durationSeconds"])
        assert "silences" in vad

        scenes = detect_scenes_ffmpeg(video_path, meta["durationSeconds"])
        assert len(scenes) >= 1
        events = detect_gaming_events("fortnite", meta["durationSeconds"], scenes, [])
        assert len(events) >= 1
