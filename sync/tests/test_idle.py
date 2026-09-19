import unittest

from twinkit_sync.idle import IdleProbes, ProcInfo, cmdline_looks_like_agent, detect_idle


NOW = 1_800_000_000


class IdleTests(unittest.TestCase):
    def test_not_running_is_idle(self):
        r = detect_idle("cursor", IdleProbes(now=NOW, processes=[], session_mtimes=[]))
        self.assertTrue(r.idle)
        self.assertFalse(r.mid_run)
        self.assertEqual(r.reason, "app_not_running")

    def test_agent_child_is_mid_run(self):
        procs = [
            ProcInfo(pid=10, name="Cursor", cmdline="/Applications/Cursor.app/Contents/MacOS/Cursor", cpu=1.0),
            ProcInfo(
                pid=11,
                name="node",
                cmdline="cursor-agent --workspace /Users/anjan/Projects/x",
                cpu=40.0,
                parent_pid=10,
            ),
        ]
        r = detect_idle("cursor", IdleProbes(now=NOW, processes=procs, session_mtimes=[]))
        self.assertTrue(r.mid_run)
        self.assertFalse(r.idle)
        self.assertIn(11, r.agent_children)

    def test_codex_exec_is_mid_run(self):
        procs = [
            ProcInfo(pid=2, name="codex", cmdline="codex exec --full-auto do the thing", cpu=12.0),
        ]
        r = detect_idle("codex", IdleProbes(now=NOW, processes=procs))
        self.assertTrue(r.mid_run)

    def test_open_but_quiet_is_idle(self):
        procs = [
            ProcInfo(pid=10, name="Cursor", cmdline="Cursor", cpu=0.4),
        ]
        # Session file 20 minutes old (quiet_minutes default 15).
        r = detect_idle(
            "cursor",
            IdleProbes(now=NOW, processes=procs, session_mtimes=[NOW - 20 * 60]),
        )
        self.assertTrue(r.idle)
        self.assertFalse(r.mid_run)
        self.assertEqual(r.reason, "app_open_but_quiet")

    def test_fresh_transcript_is_mid_run(self):
        procs = [
            ProcInfo(pid=10, name="Cursor", cmdline="Cursor", cpu=0.2),
        ]
        r = detect_idle(
            "cursor",
            IdleProbes(now=NOW, processes=procs, session_mtimes=[NOW - 30]),
        )
        self.assertTrue(r.mid_run)
        self.assertFalse(r.idle)

    def test_recent_write_outside_2m_not_idle_not_mid_run_if_cool_cpu(self):
        procs = [
            ProcInfo(pid=10, name="Cursor", cmdline="Cursor", cpu=0.2),
        ]
        r = detect_idle(
            "cursor",
            IdleProbes(now=NOW, processes=procs, session_mtimes=[NOW - 5 * 60]),
            quiet_minutes=15,
        )
        self.assertFalse(r.idle)
        self.assertFalse(r.mid_run)
        self.assertEqual(r.reason, "not_quiet")

    def test_cpu_plus_recent_write_is_mid_run(self):
        procs = [
            ProcInfo(pid=10, name="Cursor", cmdline="Cursor", cpu=22.0),
        ]
        r = detect_idle(
            "cursor",
            IdleProbes(now=NOW, processes=procs, session_mtimes=[NOW - 4 * 60]),
        )
        self.assertTrue(r.mid_run)

    def test_sockets_alone_are_not_mid_run(self):
        procs = [
            ProcInfo(pid=10, name="Cursor", cmdline="Cursor", cpu=0.3),
        ]
        r = detect_idle(
            "cursor",
            IdleProbes(
                now=NOW,
                processes=procs,
                session_mtimes=[NOW - 40 * 60],
                established_model_sockets=4,
            ),
        )
        self.assertTrue(r.idle)
        self.assertFalse(r.mid_run)

    def test_cmdline_markers(self):
        self.assertTrue(cmdline_looks_like_agent("codex exec foo"))
        self.assertTrue(cmdline_looks_like_agent("claude -p 'hi'"))
        self.assertTrue(cmdline_looks_like_agent("cursor-agent --workspace x"))
        self.assertFalse(cmdline_looks_like_agent("Cursor Helper (GPU)"))
        self.assertFalse(cmdline_looks_like_agent("/usr/bin/cloud-agent runner", harness="codex"))

    def test_macos_noise_does_not_mark_ag_mid_run(self):
        """``ag`` is a substring of ``ssh-agent`` — must not trip Antigravity."""
        procs = [
            ProcInfo(pid=1, name="ssh-agent", cmdline="/usr/bin/ssh-agent -l", cpu=0.0),
            ProcInfo(pid=2, name="UserEventAgent", cmdline="UserEventAgent", cpu=0.1),
            ProcInfo(pid=3, name="cfprefsd", cmdline="/usr/sbin/cfprefsd", cpu=0.0),
        ]
        r = detect_idle("ag", IdleProbes(now=NOW, processes=procs, session_mtimes=[]))
        self.assertFalse(r.mid_run)
        self.assertTrue(r.idle)
        self.assertFalse(cmdline_looks_like_agent("/usr/bin/ssh-agent -l", "ssh-agent", "ag"))

    def test_antigravity_agent_is_mid_run(self):
        procs = [
            ProcInfo(pid=4, name="Antigravity", cmdline="Antigravity", cpu=1.0),
            ProcInfo(pid=5, name="node", cmdline="antigravity-agent --workspace x", cpu=20.0, parent_pid=4),
        ]
        r = detect_idle("ag", IdleProbes(now=NOW, processes=procs))
        self.assertTrue(r.mid_run)


if __name__ == "__main__":
    unittest.main()
