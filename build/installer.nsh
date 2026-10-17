!ifndef FILECONVERTER_NSH_INCLUDED
!define FILECONVERTER_NSH_INCLUDED

!ifndef BUILD_UNINSTALLER

!include LogicLib.nsh
!include nsDialogs.nsh

Var FileConverterCheckbox
Var FileConverterChecked

; 安装向导中的「推荐工具」选项页：默认勾选，可取消
!macro customPageAfterChangeDir
  Page custom FileConverterPageCreate FileConverterPageLeave
!macroend

Function FileConverterPageCreate
  nsDialogs::Create 1018
  Pop $0
  ${If} $0 == error
    Abort
  ${EndIf}

  ${NSD_CreateLabel} 0 0u 100% 14u "选择推荐工具"
  Pop $0
  ${NSD_CreateLabel} 0 20u 100% 36u "FileConverter 是一个开源的格式转换工具：安装后在文件上点右键，就能把图片、音视频、文档和 PDF 转成其他格式。"
  Pop $0
  ${NSD_CreateCheckBox} 0 62u 100% 12u "同时安装 FileConverter（约 60MB，需要联网）"
  Pop $FileConverterCheckbox
  ${NSD_SetState} $FileConverterCheckbox ${BST_CHECKED}

  nsDialogs::Show
FunctionEnd

Function FileConverterPageLeave
  ${NSD_GetState} $FileConverterCheckbox $FileConverterChecked
FunctionEnd

!macro customInstall
  ${If} $FileConverterChecked == ${BST_CHECKED}
    DetailPrint "正在安装 FileConverter..."
    nsExec::ExecToLog 'winget install --id AdrienAllard.FileConverter -e --silent --accept-package-agreements --accept-source-agreements'
    Pop $0
    ${If} $0 != 0
      MessageBox MB_OK|MB_ICONINFORMATION "FileConverter 没有自动安装成功，可能未安装 winget 或网络受限。可以稍后打开 AppPantry 的「格式转换」页面手动安装。"
    ${EndIf}
  ${EndIf}
!macroend

!endif ; BUILD_UNINSTALLER

!endif
