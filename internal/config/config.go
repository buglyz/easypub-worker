// Package config 加载并保存 EasyPub 风格的 config.xml 与 ereaders.xml。
//
// 字段命名与原 config.xml 保持一致，便于和原工具的配置文件互相替换。
package config

import (
	"encoding/xml"
	"os"
	"path/filepath"
)

// Root 对应 config.xml 的根节点 <EasyPubConfig>。
type Root struct {
	XMLVersion     string         `xml:"XMLVersion"`
	EReadersConfig string         `xml:"eReadersConfig"`
	MyRegExp       MyRegExp       `xml:"MyRegExp"`
	Recent         RecentOptions  `xml:"RecentOptions"`
	Advanced       AdvancedOptions `xml:"AdvancedOptions"`
}

// MyRegExp 对应预定义正则表达式区段。
type MyRegExp struct {
	AdditionalReg []string `xml:"AdditionalReg>data"`
	FullReg       []string `xml:"FullReg>data"`
}

// RecentOptions 对应“上次的选择”区段。
type RecentOptions struct {
	SplitMode          int    `xml:"splitmode"`
	SplitCount         int    `xml:"splitcount"`
	Top                int    `xml:"top"`
	Bottom             int    `xml:"bottom"`
	Left               int    `xml:"left"`
	Right              int    `xml:"right"`
	LineHeight         int    `xml:"lineheight"`
	FontSize           int    `xml:"fontsize"`
	Indent             int    `xml:"indent"`
	MarginTop          int    `xml:"margintop"`
	RemoveBlankLine    int    `xml:"removeblankline"`
	FontType           int    `xml:"fonttype"`
	MachineID          int    `xml:"machineid"`
	FontCustomized     string `xml:"font_customized"`
	FontEmbedded       string `xml:"font_embedded"`
	FontSubsetting     int    `xml:"font_subsetting"`
	Editor             string `xml:"editor"`
	OutputFolder       string `xml:"outputfolder"`
	CSSOverwrite       int    `xml:"cssoverwrite"`
	ForceTextCover    int    `xml:"forcetextcover"`
	AddSpace           int    `xml:"addspace"`
	SaveCSS            int    `xml:"savecss"`
	SimpleRegP1        string `xml:"simple_reg_p1"`
	SimpleRegP2        int    `xml:"simple_reg_p2"`
	SimpleRegP3        string `xml:"simple_reg_p3"`
	SimpleRegExt       string `xml:"simple_reg_ext"`
	FullReg            string `xml:"full_reg"`
	SimpleRegLeadSpace int    `xml:"simple_reg_leadingspace"`
	TextAlign          int    `xml:"textalign"`
	AddSpaceCount      int    `xml:"addspacecount"`
	PosX1              int    `xml:"posx1"`
	PosY1              int    `xml:"posy1"`
	PosX2              int    `xml:"posx2"`
	PosY2              int    `xml:"posy2"`
	AutoMark           int    `xml:"automark"`
	CoverStyle         int    `xml:"coverstyle"`
	TitleFont          int    `xml:"titlefont"`
	AuthorFont         int    `xml:"authorfont"`
	PageTopUnit        int    `xml:"pagetopunit"`
	PageBottomUnit     int    `xml:"pagebottomunit"`
	PageLeftUnit       int    `xml:"pageleftunit"`
	PageRightUnit      int    `xml:"pagerightunit"`
	MarginTopUnit      int    `xml:"margintopunit"`
}

// AdvancedOptions 对应“高级选项”区段。
type AdvancedOptions struct {
	SilentMode        int    `xml:"silentmode"`
	EnableHTMLRawTag  int    `xml:"enable_htmlrawtag"`
	HTMLRawTag        string `xml:"htmlrawtag"`
	EnableTempDir     int    `xml:"enable_tempdir"`
	TempDir           string `xml:"tempdir"`
	FlowSize          int    `xml:"flowsize"`
	ScreenWidth       int    `xml:"screenwidth"`
	ScreenHeight      int    `xml:"screenheight"`
	CoverStyle        int    `xml:"coverstyle"`
	TOCSpace         int    `xml:"tocspace"`
	ForceEmptyChapter int    `xml:"forceemptychapter"`
	OutputFormat      int    `xml:"outputformat"`
	MobiStrip         int    `xml:"mobistrip"`
	MobiSync          int    `xml:"mobisync"`
	ASINStyle        int    `xml:"asinstyle"`
	MobiASIN         string `xml:"mobiasin"`
	KindleGenExe      string `xml:"kindlegenexe"`
	KindleGenCompress int    `xml:"kindlegencompress"`
	KindleGenOption   string `xml:"kindlegenoption"`
	MobiPeriodical    int    `xml:"mobiperiodical"`
	MobiForceEN       int    `xml:"mobiforceen"`
	MobiFormat        int    `xml:"mobiformat"`
	OutputToSrc       int    `xml:"outputtosrc"`
	EmptyChapterStyle int    `xml:"emptychapterstyle"`
	AlwaysOnTop       int    `xml:"alwaysontop"`
}

// EReaders 对应 ereaders.xml 的根节点。
type EReaders struct {
	XMLName xml.Name `xml:"EasyPubConfig"`
	Models  []Model  `xml:"eReaders>model"`
}

// Model 对应 ereaders.xml 中单个阅读器配置。
type Model struct {
	Name  string   `xml:"name"`
	Fonts []string `xml:"font"`
}

// Load 从 path 读取 config.xml 并解析。
func Load(path string) (*Root, error) {
	b, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var r Root
	if err := xml.Unmarshal(b, &r); err != nil {
		return nil, err
	}
	if r.EReadersConfig == "" {
		r.EReadersConfig = "ereaders.xml"
	}
	return &r, nil
}

// LoadEReaders 从 dir/ereaders.xml(或 cfg.EReadersConfig 指定的文件名)读取阅读器字体配置。
func (r *Root) LoadEReaders(dir string) (*EReaders, error) {
	name := r.EReadersConfig
	if name == "" {
		name = "ereaders.xml"
	}
	p := filepath.Join(dir, name)
	b, err := os.ReadFile(p)
	if err != nil {
		return nil, err
	}
	var e EReaders
	if err := xml.Unmarshal(b, &e); err != nil {
		return nil, err
	}
	return &e, nil
}

// Save 将配置写回 path。
func Save(path string, r *Root) error {
	b, err := xml.MarshalIndent(r, "", "  ")
	if err != nil {
		return err
	}
	out := append([]byte(xml.Header), b...)
	return os.WriteFile(path, out, 0o644)
}
