package mobi

import "testing"

func TestSplitExtraOptions_RejectsShellMeta(t *testing.T) {
	cases := []string{
		"-c1; rm -rf /",
		"-o $(whoami)",
		"a|b",
		"x > y",
		"a`b`",
	}
	for _, c := range cases {
		if _, err := splitExtraOptions(c); err == nil {
			t.Errorf("应拒绝含 shell 元字符的参数: %q", c)
		}
	}
}

func TestSplitExtraOptions_OK(t *testing.T) {
	got, err := splitExtraOptions("-c1 -verbose")
	if err != nil {
		t.Fatalf("err: %v", err)
	}
	if len(got) != 2 || got[0] != "-c1" || got[1] != "-verbose" {
		t.Errorf("got=%v", got)
	}
}

func TestMobiPathFor(t *testing.T) {
	if got := mobiPathFor("a/b/book.epub"); got != "a/b/book.mobi" {
		t.Errorf("got=%s", got)
	}
}
