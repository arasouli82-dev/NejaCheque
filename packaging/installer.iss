; Inno Setup 6 script: turns dist\NejaCheque (PyInstaller output) into NejaCheque-Setup-<version>.exe
;   iscc /DAppVersion=1.0.0 packaging\installer.iss
#ifndef AppVersion
  #define AppVersion "1.0.0"
#endif

[Setup]
AppId={{6E7A1C3B-4D2F-4B8E-9A61-5C0D3E9F7A21}
AppName=Neja Cheque
AppVerName=Neja Cheque {#AppVersion}
AppVersion={#AppVersion}
AppPublisher=Ali Rasoulinejad (Neja)
AppPublisherURL=https://www.linkedin.com/in/ali-rasoulinejad-bb400b243
DefaultDirName={autopf}\NejaCheque
DefaultGroupName=Neja Cheque
DisableProgramGroupPage=yes
OutputDir=..\dist
OutputBaseFilename=NejaCheque-Setup-{#AppVersion}
SetupIconFile=nejacheque.ico
UninstallDisplayIcon={app}\NejaCheque.exe
LicenseFile=..\LICENSE
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=admin
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible

[Tasks]
Name: "desktopicon"; Description: "Create a desktop icon"; GroupDescription: "Shortcuts:"
Name: "startup"; Description: "Start Neja Cheque when Windows starts (the server stays on for the whole office)"; GroupDescription: "Options:"; Flags: unchecked
Name: "firewall"; Description: "Let other computers on the network open it (Windows Firewall rule)"; GroupDescription: "Options:"

[Dirs]
; shared data folder: every user of this computer may write the database there
Name: "{commonappdata}\NejaCheque"; Permissions: users-modify

[Files]
Source: "..\dist\NejaCheque\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{autoprograms}\نژا چک"; Filename: "{app}\NejaCheque.exe"; WorkingDir: "{app}"
Name: "{autodesktop}\نژا چک"; Filename: "{app}\NejaCheque.exe"; WorkingDir: "{app}"; Tasks: desktopicon
Name: "{commonstartup}\نژا چک"; Filename: "{app}\NejaCheque.exe"; Parameters: "--no-browser"; WorkingDir: "{app}"; Flags: runminimized; Tasks: startup

[Run]
Filename: "{sys}\netsh.exe"; Parameters: "advfirewall firewall add rule name=""Neja Cheque"" dir=in action=allow program=""{app}\NejaCheque.exe"" enable=yes profile=private,domain"; Flags: runhidden; Tasks: firewall
Filename: "{app}\NejaCheque.exe"; Description: "Open Neja Cheque now"; Flags: postinstall nowait skipifsilent

[UninstallRun]
Filename: "{sys}\netsh.exe"; Parameters: "advfirewall firewall delete rule name=""Neja Cheque"""; Flags: runhidden; RunOnceId: "NejaChequeFirewall"

; The database in %ProgramData%\NejaCheque is kept on uninstall, so a reinstall or upgrade keeps every cheque.
