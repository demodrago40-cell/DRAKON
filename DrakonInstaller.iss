[Setup]
AppName=Drakon AI
AppVersion=1.0
OutputBaseFilename=Drakon_Setup_v1
DefaultDirName={autopf}\Drakon AI
DefaultGroupName=Drakon AI
SetupIconFile=drakon.ico
UninstallDisplayIcon={app}\Drakon.exe
Compression=lzma2/ultra64
SolidCompression=yes
LZMAAlgorithm=1
LZMABlockSize=262144
PrivilegesRequired=lowest

[Files]
Source: "dist\Drakon.exe"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{group}\Drakon AI"; Filename: "{app}\Drakon.exe"
Name: "{group}\Uninstall Drakon AI"; Filename: "{uninstallexe}"
Name: "{autodesktop}\Drakon AI"; Filename: "{app}\Drakon.exe"; Tasks: desktopicon

[Tasks]
Name: "desktopicon"; Description: "Create a &desktop shortcut"; GroupDescription: "Additional icons:"

[Run]
Filename: "{app}\Drakon.exe"; Description: "Launch Drakon AI"; Flags: nowait postinstall skipifsilent
