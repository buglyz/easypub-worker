package config

import (
	"os"
	"path/filepath"
	"testing"
)

func TestLoad_RoundTrip(t *testing.T) {
	dir := t.TempDir()
	p := filepath.Join(dir, "config.xml")
	src := `<?xml version="1.0" encoding="utf-8"?>
<EasyPubConfig>
  <XMLVersion>2</XMLVersion>
  <eReadersConfig>ereaders.xml</eReadersConfig>
  <MyRegExp>
    <AdditionalReg><data>^\s*(前言|自序)</data></AdditionalReg>
    <FullReg><data>^\s*第.*章</data></FullReg>
  </MyRegExp>
  <RecentOptions>
    <lineheight>150</lineheight>
    <fontsize>110</fontsize>
    <margintop>8</margintop>
    <textalign>1</textalign>
    <indent>2</indent>
    <full_reg>^\s*(第\s*[0-9]+\s*章)</full_reg>
    <simple_reg_p1>[第卷]</simple_reg_p1>
    <simple_reg_p2>0</simple_reg_p2>
    <simple_reg_p3>[章回卷节集部]</simple_reg_p3>
    <simple_reg_leadingspace>1</simple_reg_leadingspace>
    <automark>1</automark>
    <removeblankline>1</removeblankline>
    <addspace>0</addspace>
    <addspacecount>2</addspacecount>
  </RecentOptions>
  <AdvancedOptions>
    <kindlegenexe>kindlegen_v2.9.exe</kindlegenexe>
    <kindlegencompress>1</kindlegencompress>
    <forceemptychapter>1</forceemptychapter>
  </AdvancedOptions>
</EasyPubConfig>
`
	if err := os.WriteFile(p, []byte(src), 0o644); err != nil {
		t.Fatalf("WriteFile: %v", err)
	}
	cfg, err := Load(p)
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if cfg.Recent.LineHeight != 150 {
		t.Errorf("lineheight=%d", cfg.Recent.LineHeight)
	}
	if cfg.Recent.FontSize != 110 {
		t.Errorf("fontsize=%d", cfg.Recent.FontSize)
	}
	if cfg.Recent.SimpleRegP2 != 0 {
		t.Errorf("simple_reg_p2=%d", cfg.Recent.SimpleRegP2)
	}
	if cfg.Recent.SimpleRegLeadSpace != 1 {
		t.Errorf("simple_reg_leadingspace=%d", cfg.Recent.SimpleRegLeadSpace)
	}
	if cfg.Recent.TextAlign != 1 {
		t.Errorf("textalign=%d", cfg.Recent.TextAlign)
	}
	if cfg.Advanced.ForceEmptyChapter != 1 {
		t.Errorf("forceemptychapter=%d", cfg.Advanced.ForceEmptyChapter)
	}
	if len(cfg.MyRegExp.AdditionalReg) != 1 || cfg.MyRegExp.AdditionalReg[0] != `^\s*(前言|自序)` {
		t.Errorf("AdditionalReg=%v", cfg.MyRegExp.AdditionalReg)
	}
}

func TestLoadEReaders(t *testing.T) {
	dir := t.TempDir()
	// config 不需存在,直接构造 Root。
	cfg := &Root{EReadersConfig: "ereaders.xml"}
	p := filepath.Join(dir, "ereaders.xml")
	src := `<?xml version="1.0" encoding="utf-8"?>
<EasyPubConfig>
  <eReaders>
    <model>
      <name>测试设备</name>
      <font>res:///a/b/c.ttf</font>
      <font>res:///d/e/f.ttf</font>
    </model>
  </eReaders>
</EasyPubConfig>
`
	if err := os.WriteFile(p, []byte(src), 0o644); err != nil {
		t.Fatalf("WriteFile: %v", err)
	}
	er, err := cfg.LoadEReaders(dir)
	if err != nil {
		t.Fatalf("LoadEReaders: %v", err)
	}
	if len(er.Models) != 1 {
		t.Fatalf("Models len=%d", len(er.Models))
	}
	if er.Models[0].Name != "测试设备" {
		t.Errorf("name=%s", er.Models[0].Name)
	}
	if len(er.Models[0].Fonts) != 2 || er.Models[0].Fonts[1] != "res:///d/e/f.ttf" {
		t.Errorf("Fonts=%v", er.Models[0].Fonts)
	}
}
