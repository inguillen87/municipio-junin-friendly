// SPDX-License-Identifier: GPL-2.0-only
// Installation engine: embedded, pinned files only. No discovery, credential creation,
// device calls, database access, automatic enrollment or automatic task activation.
using System;
using System.Collections;
using System.Collections.Generic;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.IO.Compression;
using System.Management;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Security.AccessControl;
using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
using System.Security.Principal;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Web.Script.Serialization;
using System.Xml;

namespace MuniControl.Setup {
 public sealed class ClockDraft {
  public string Location {get;set;} public string Host {get;set;} public int Port {get;set;}
  public string Serial {get;set;} public string Protocol {get;set;}
 }
 public sealed class InstallationDraft {
  public string MunicipalityName {get;set;} public string TargetEnvironment {get;set;}
  public List<ClockDraft> Clocks {get;set;}
 }
 public sealed class BackendResult {
  public bool Success {get;set;} public string Code {get;set;} public string Summary {get;set;}
  public List<string> Details {get;set;} public string InstallPath {get;set;} public string ExistingStatusPath {get;set;}
  public string GuidePath {get;set;} public string AppVersion {get;set;} public string DraftSavedPath {get;set;}
  public bool Installed {get;set;} public bool LegacyDetected {get;set;} public bool Configured {get;set;} public bool CanActivate {get;set;}
  public InstallationDraft Draft {get;set;}
  public BackendResult(){ Details=new List<string>(); }
 }
 internal sealed class SetupFault : Exception { internal string Code; internal SetupFault(string code):base(code){Code=code;} }
 internal sealed class FilePin { internal string Path; internal long Bytes; internal string Sha; }
 internal sealed class Inspection { internal bool Installed; internal bool Legacy; internal bool Configured; internal bool MachineTask; internal string Existing; }
 internal sealed class ProcessAnswer {internal int ExitCode;internal string Output;}

 public static class SetupBackend {
  const string Resource="MuniControl.Payload.zip", Manifest="INSTALLER-MANIFEST.json", TaskName="MuniControl-MunicipalClockGateway";
  const long MaxPayload=128L*1024*1024, MaxExpanded=256L*1024*1024;
  static readonly string Base=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData),"MuniControl","ClockGateway");
  static readonly string DraftRoot=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"MuniControl","InstallerDraft");
  static readonly object Gate=new object();static bool sourceStoppedConfirmed;
  static readonly HashSet<string> Extra=new HashSet<string>(StringComparer.Ordinal){
   "release-manifest.json","runtime/node.exe","runtime/LICENSE","modelos/gateway.example.json","modelos/fleet-capture.example.json","modelos/source-delivery.example.json",
   "README-INSTALADOR.md","LEEME-PRIMERO.html","ADAPTADORES-Y-CRECIMIENTO.md","GUIA-TECNICA-WINDOWS11.md","LICENCIA-Y-DISTRIBUCION.md","DATOS-DE-LA-INSTALACION.md","device-adapters.json"
  };
  static readonly HashSet<string> AppFiles=new HashSet<string>(StringComparer.Ordinal){
   "app/clock-fleet/capture-policy.mjs","app/clock-fleet/control.mjs","app/clock-fleet/delivery.mjs","app/clock-fleet/gateway-config.mjs","app/clock-fleet/gateway.mjs",
   "app/clock-fleet/install-machine-windows.ps1","app/clock-fleet/install-machine-linux.sh","app/clock-fleet/MUNICIPAL_HOST.md","app/clock-fleet/municontrol-clock-gateway.service",
   "app/clock-fleet/operator-help.mjs","app/clock-fleet/overview.mjs","app/clock-fleet/README.md","app/clock-fleet/runner.mjs","app/clock-fleet/sender.mjs","app/clock-fleet/source-delivery.mjs","app/clock-fleet/source-sender.mjs",
   "app/pm10/config.mjs","app/pm10/delivery.mjs","app/pm10/delivery-status.mjs","app/pm10/file-replacement.mjs","app/pm10/LICENSE","app/pm10/route-guard.mjs","app/pm10/sender.mjs","app/pm10/service.mjs","app/pm10/store.mjs","app/pm10/reader/lector-fichadas.mjs","app/pm10/reader/zk-core-v3.mjs","app/pm10/reader/REFERENCIAS.md","verify-release.mjs"
  };
  static void Need(bool condition,string code){if(!condition)throw new SetupFault(code);}
  static bool Admin(){return new WindowsPrincipal(WindowsIdentity.GetCurrent()).IsInRole(WindowsBuiltInRole.Administrator);}
  static string Hash(Stream stream){using(var h=SHA256.Create()){return BitConverter.ToString(h.ComputeHash(stream)).Replace("-","").ToLowerInvariant();}}
  static string Hash(byte[] bytes){using(var m=new MemoryStream(bytes,false)){return Hash(m);}}
  static string HashFile(string path){NoReparse(path);using(var f=new FileStream(path,FileMode.Open,FileAccess.Read,FileShare.Read)){return Hash(f);}}
  static JavaScriptSerializer Json(){return new JavaScriptSerializer{MaxJsonLength=2*1024*1024,RecursionLimit=32};}
  static Dictionary<string,object> Object(byte[] bytes){try{return (Dictionary<string,object>)Json().DeserializeObject(new UTF8Encoding(false,true).GetString(bytes));}catch{throw new SetupFault("PACKAGE_MANIFEST_INVALID");}}
  static string Text(Dictionary<string,object> v,string key){object x;Need(v.TryGetValue(key,out x)&&x is string,"PACKAGE_MANIFEST_INVALID");return (string)x;}
  static long Integer(Dictionary<string,object> v,string key){object x;Need(v.TryGetValue(key,out x)&&(x is int||x is long),"PACKAGE_MANIFEST_INVALID");return Convert.ToInt64(x,CultureInfo.InvariantCulture);}
  static byte[] Bounded(Stream s,long max){using(var m=new MemoryStream()){var buffer=new byte[32768];int n;long count=0;while((n=s.Read(buffer,0,buffer.Length))>0){count+=n;Need(count<=max,"PACKAGE_SIZE_INVALID");m.Write(buffer,0,n);}return m.ToArray();}}
  static byte[] ReadFile(string file,int max){NoReparse(file);Need(new FileInfo(file).Length<=max,"FILE_TOO_LARGE");return File.ReadAllBytes(file);}

  internal static bool SafeRelative(string name){
   if(String.IsNullOrEmpty(name)||name.Length>200||!Regex.IsMatch(name,"^[A-Za-z0-9][A-Za-z0-9._/-]*\\z",RegexOptions.CultureInvariant)||name.EndsWith("/",StringComparison.Ordinal))return false;
   foreach(var part in name.Split('/')){
    if(part.Length==0||part=="."||part==".."||part.EndsWith(".",StringComparison.Ordinal))return false;
    if(Regex.IsMatch(part.Split('.')[0],"^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$",RegexOptions.IgnoreCase|RegexOptions.CultureInvariant))return false;
   }
   return true;
  }
  static string Inside(string root,string relative){
   Need(SafeRelative(relative),"PACKAGE_PATH_INVALID");string full=Path.GetFullPath(Path.Combine(root,relative.Replace('/',Path.DirectorySeparatorChar)));
   Need(full.StartsWith(Path.GetFullPath(root).TrimEnd(Path.DirectorySeparatorChar)+Path.DirectorySeparatorChar,StringComparison.OrdinalIgnoreCase),"PACKAGE_PATH_INVALID");return full;
  }
  static void NoReparse(string name){
   string full=Path.GetFullPath(name),at=full;
   while(!String.IsNullOrEmpty(at)){
    if(File.Exists(at)||Directory.Exists(at))Need((File.GetAttributes(at)&FileAttributes.ReparsePoint)==0,"REPARSE_POINT_DENIED");
    string parent=Path.GetDirectoryName(at);if(parent==at)break;at=parent;
   }
  }
  static void NoTreeReparse(string root){NoReparse(root);foreach(string d in Directory.GetDirectories(root)){NoTreeReparse(d);}foreach(string f in Directory.GetFiles(root))NoReparse(f);}
  static void ProtectedDirectory(string dir,bool draft){
   NoReparse(dir);Directory.CreateDirectory(dir);NoReparse(dir);
   var acl=new DirectorySecurity();acl.SetAccessRuleProtection(true,false);
   var all=FileSystemRights.FullControl;var inherited=InheritanceFlags.ContainerInherit|InheritanceFlags.ObjectInherit;
   acl.AddAccessRule(new FileSystemAccessRule(new SecurityIdentifier(WellKnownSidType.LocalSystemSid,null),all,inherited,PropagationFlags.None,AccessControlType.Allow));
   if(draft)acl.AddAccessRule(new FileSystemAccessRule(WindowsIdentity.GetCurrent().User,all,inherited,PropagationFlags.None,AccessControlType.Allow));
   else{
    acl.AddAccessRule(new FileSystemAccessRule(new SecurityIdentifier(WellKnownSidType.BuiltinAdministratorsSid,null),all,inherited,PropagationFlags.None,AccessControlType.Allow));
    acl.AddAccessRule(new FileSystemAccessRule(new SecurityIdentifier(WellKnownSidType.LocalServiceSid,null),FileSystemRights.ReadAndExecute,inherited,PropagationFlags.None,AccessControlType.Allow));
    acl.AddAccessRule(new FileSystemAccessRule(WindowsIdentity.GetCurrent().User,FileSystemRights.ReadAndExecute,inherited,PropagationFlags.None,AccessControlType.Allow));
   }
   Directory.SetAccessControl(dir,acl);
  }
  static void ProtectedParent(string dir){
   NoReparse(dir);var allowed=new HashSet<string>(StringComparer.Ordinal){"S-1-5-18","S-1-5-32-544",WindowsIdentity.GetCurrent().User.Value};
   var acl=Directory.GetAccessControl(dir);var owner=(SecurityIdentifier)acl.GetOwner(typeof(SecurityIdentifier));Need(allowed.Contains(owner.Value),"INSTALLATION_PARENT_UNSAFE");
   var writes=FileSystemRights.Write|FileSystemRights.Delete|FileSystemRights.DeleteSubdirectoriesAndFiles|FileSystemRights.ChangePermissions|FileSystemRights.TakeOwnership;
   foreach(FileSystemAccessRule rule in acl.GetAccessRules(true,true,typeof(SecurityIdentifier)))if(rule.AccessControlType==AccessControlType.Allow&&(rule.FileSystemRights&writes)!=0)Need(allowed.Contains(((SecurityIdentifier)rule.IdentityReference).Value),"INSTALLATION_PARENT_UNSAFE");
  }
  static List<FilePin> ReadPins(byte[] manifest){
   Need(Hash(manifest)==PackagePins.ManifestSha256,"PACKAGE_MANIFEST_HASH_MISMATCH");var json=Object(manifest);object list;
   Need(json.TryGetValue("files",out list)&&list is object[],"PACKAGE_MANIFEST_INVALID");var rows=(object[])list;
   Need(rows.Length==AppFiles.Count+Extra.Count,"PACKAGE_FILE_COUNT_INVALID");var paths=new HashSet<string>(StringComparer.OrdinalIgnoreCase);var result=new List<FilePin>();long total=0;
   foreach(object row in rows){var v=row as Dictionary<string,object>;Need(v!=null&&v.Count==3,"PACKAGE_MANIFEST_INVALID");
    string name=Text(v,"path"),hash=Text(v,"sha256");long size=Integer(v,"bytes");
    Need(SafeRelative(name)&&(AppFiles.Contains(name)||Extra.Contains(name))&&paths.Add(name),"PACKAGE_PATH_INVALID");
    Need(size>0&&size<=128L*1024*1024&&Regex.IsMatch(hash,"^[a-f0-9]{64}$"),"PACKAGE_SIZE_INVALID");
    total=checked(total+size);Need(total<=MaxExpanded,"PACKAGE_SIZE_INVALID");result.Add(new FilePin{Path=name,Bytes=size,Sha=hash});
   }
   Need(total==PackagePins.ExpandedBytes||total+manifest.Length==PackagePins.ExpandedBytes,"PACKAGE_SIZE_INVALID");return result;
  }
  static Dictionary<string,ZipArchiveEntry> ZipEntries(ZipArchive zip){
   var entries=new Dictionary<string,ZipArchiveEntry>(StringComparer.OrdinalIgnoreCase);
   foreach(var entry in zip.Entries){
    Need(SafeRelative(entry.FullName)&&!entries.ContainsKey(entry.FullName),"PACKAGE_PATH_INVALID");
    int unixType=(entry.ExternalAttributes>>16)&0xF000;
    Need(unixType==0||unixType==0x8000,"PACKAGE_LINK_DENIED");Need((entry.ExternalAttributes&0x400)==0,"PACKAGE_LINK_DENIED");
    Need(entry.Length>0&&entry.Length<=128L*1024*1024,"PACKAGE_SIZE_INVALID");entries.Add(entry.FullName,entry);Need(entries.Count<=96,"PACKAGE_FILE_COUNT_INVALID");
   }
   return entries;
  }
  static void VerifyReleaseManifest(byte[] bytes,List<FilePin> pins){
   var v=Object(bytes);object dirty;Need(Text(v,"sourceCommit")==PackagePins.ReleaseCommit&&v.TryGetValue("sourceDirty",out dirty)&&dirty is bool&&!(bool)dirty,"RELEASE_NOT_CLEAN");
   object list;Need(v.TryGetValue("files",out list)&&list is object[]&&((object[])list).Length==AppFiles.Count,"RELEASE_MANIFEST_INVALID");var seen=new HashSet<string>(StringComparer.Ordinal);
   foreach(object item in (object[])list){var r=item as Dictionary<string,object>;Need(r!=null,"RELEASE_MANIFEST_INVALID");var name=Text(r,"path");Need(AppFiles.Contains(name)&&seen.Add(name),"RELEASE_MANIFEST_INVALID");var pin=pins.Find(p=>p.Path==name);Need(pin!=null&&pin.Sha==Text(r,"sha256")&&pin.Bytes==Integer(r,"bytes"),"RELEASE_MANIFEST_INVALID");}
  }
  // The same validator is exercised by SelfTest with in-memory malicious paths.
  static List<FilePin> ExtractPinnedPayload(string stage){
   using(Stream resource=Assembly.GetExecutingAssembly().GetManifestResourceStream(Resource)){
    Need(resource!=null&&resource.CanSeek&&resource.Length==PackagePins.PayloadBytes&&resource.Length>0&&resource.Length<=MaxPayload,"PAYLOAD_MISSING_OR_INVALID");
    Need(Hash(resource)==PackagePins.PayloadSha256,"PAYLOAD_HASH_MISMATCH");resource.Position=0;
    using(var zip=new ZipArchive(resource,ZipArchiveMode.Read,true)){
     var entries=ZipEntries(zip);ZipArchiveEntry me;Need(entries.TryGetValue(Manifest,out me)&&me.Length<=1024*1024,"PACKAGE_MANIFEST_INVALID");byte[] manifest;
     using(var input=me.Open())manifest=Bounded(input,1024*1024);
     var pins=ReadPins(manifest);Need(entries.Count==pins.Count+1,"PACKAGE_FILE_COUNT_INVALID");
     foreach(var pin in pins){ZipArchiveEntry entry;Need(entries.TryGetValue(pin.Path,out entry)&&entry.FullName==pin.Path&&entry.Length==pin.Bytes,"PACKAGE_ENTRY_MISMATCH");}
     byte[] release;using(var input=entries["release-manifest.json"].Open())release=Bounded(input,1024*1024);VerifyReleaseManifest(release,pins);
     foreach(var pin in pins){string target=Inside(stage,pin.Path);NoReparse(target);Directory.CreateDirectory(Path.GetDirectoryName(target));NoReparse(target);
      using(var input=entries[pin.Path].Open())using(var output=new FileStream(target,FileMode.CreateNew,FileAccess.Write,FileShare.None)){
       var buffer=new byte[32768];int n;long actual=0;while((n=input.Read(buffer,0,buffer.Length))>0){actual+=n;Need(actual<=pin.Bytes,"PACKAGE_SIZE_INVALID");output.Write(buffer,0,n);}Need(actual==pin.Bytes,"PACKAGE_SIZE_INVALID");output.Flush(true);
      }
      Need(HashFile(target)==pin.Sha,"PACKAGE_FILE_HASH_MISMATCH");
     }
     using(var output=new FileStream(Path.Combine(stage,Manifest),FileMode.CreateNew,FileAccess.Write,FileShare.None)){output.Write(manifest,0,manifest.Length);output.Flush(true);}
     return pins;
    }
   }
  }
  static void VerifyInstalled(string root){
   NoReparse(root);Need(Directory.Exists(root),"INSTALLATION_MISSING");var pins=ReadPins(ReadFile(Path.Combine(root,Manifest),1024*1024));
   foreach(var p in pins){string file=Inside(root,p.Path);Need(File.Exists(file)&&new FileInfo(file).Length==p.Bytes&&HashFile(file)==p.Sha,"INSTALLED_FILES_CHANGED");}
   VerifyReleaseManifest(ReadFile(Path.Combine(root,"release-manifest.json"),1024*1024),pins);
   // Extra executable files in app/runtime could be loaded by a future accidental import.
   foreach(var sub in new[]{"app","runtime"}){NoTreeReparse(Path.Combine(root,sub));foreach(string file in Directory.GetFiles(Path.Combine(root,sub),"*",SearchOption.AllDirectories)){
    string rel=file.Substring(root.TrimEnd('\\').Length+1).Replace('\\','/');Need(pins.Exists(p=>p.Path==rel),"INSTALLED_FILES_CHANGED");}}
   VerifyNode(Path.Combine(root,"runtime","node.exe"));
  }
  [StructLayout(LayoutKind.Sequential,CharSet=CharSet.Unicode)]struct TrustFile {public uint Size;public string File;public IntPtr Handle;public IntPtr Subject;}
  [StructLayout(LayoutKind.Sequential,CharSet=CharSet.Unicode)]struct TrustData {public uint Size;public IntPtr Policy;public IntPtr Sip;public uint Ui;public uint Revoke;public uint Choice;public IntPtr File;public uint StateAction;public IntPtr State;public string Url;public uint Flags;public uint UiContext;}
  [DllImport("wintrust.dll",ExactSpelling=true,SetLastError=false,CharSet=CharSet.Unicode)]static extern uint WinVerifyTrust(IntPtr hwnd,[MarshalAs(UnmanagedType.LPStruct)]Guid action,ref TrustData data);
  static void VerifyNode(string file){
   Need(HashFile(file)==PackagePins.NodeSha256,"NODE_HASH_MISMATCH");var info=new TrustFile{Size=(uint)Marshal.SizeOf(typeof(TrustFile)),File=file};IntPtr ptr=Marshal.AllocHGlobal(Marshal.SizeOf(info));
   try{Marshal.StructureToPtr(info,ptr,false);var data=new TrustData{Size=(uint)Marshal.SizeOf(typeof(TrustData)),Ui=2,Revoke=0,Choice=1,File=ptr,StateAction=1,Flags=0x1000};
    uint status;try{status=WinVerifyTrust(new IntPtr(-1),new Guid("00AAC56B-CD44-11d0-8CC2-00C04FC295EE"),ref data);}finally{data.StateAction=2;WinVerifyTrust(new IntPtr(-1),new Guid("00AAC56B-CD44-11d0-8CC2-00C04FC295EE"),ref data);}
    Need(status==0,"NODE_SIGNATURE_INVALID");
    using(var cert=new X509Certificate2(X509Certificate.CreateFromSignedFile(file)))Need(cert.GetNameInfo(X509NameType.SimpleName,false)=="OpenJS Foundation"&&Regex.IsMatch(cert.Subject,"(?:^|, )O=OpenJS Foundation(?:,|$)"),"NODE_PUBLISHER_INVALID");
   }finally{Marshal.DestroyStructure(ptr,typeof(TrustFile));Marshal.FreeHGlobal(ptr);}
  }
  static object Call(object obj,string method,params object[] args){return obj.GetType().InvokeMember(method,BindingFlags.InvokeMethod,null,obj,args,CultureInfo.InvariantCulture);}
  static object Get(object obj,string property){return obj.GetType().InvokeMember(property,BindingFlags.GetProperty,null,obj,null,CultureInfo.InvariantCulture);}
  static void Set(object obj,string property,object value){obj.GetType().InvokeMember(property,BindingFlags.SetProperty,null,obj,new[]{value},CultureInfo.InvariantCulture);}
  static void Free(object obj){if(obj!=null&&Marshal.IsComObject(obj))Marshal.FinalReleaseComObject(obj);}
  static object TaskFolder(out object service){var type=Type.GetTypeFromProgID("Schedule.Service");Need(type!=null,"SCHEDULER_UNAVAILABLE");service=Activator.CreateInstance(type);Call(service,"Connect");return Call(service,"GetFolder","\\");}
  static string Single(XmlDocument xml,XmlNamespaceManager ns,string xpath){var nodes=xml.SelectNodes(xpath,ns);Need(nodes!=null&&nodes.Count==1,"TASK_REGISTRATION_INVALID");return nodes[0].InnerText;}
  static void ValidateTask(object task){
   var xml=new XmlDocument{XmlResolver=null};using(var sr=new StringReader((string)Get(task,"Xml")))using(var reader=XmlReader.Create(sr,new XmlReaderSettings{DtdProcessing=DtdProcessing.Prohibit,XmlResolver=null}))xml.Load(reader);
   var ns=new XmlNamespaceManager(xml.NameTable);ns.AddNamespace("t","http://schemas.microsoft.com/windows/2004/02/mit/task");
   Need(Single(xml,ns,"/t:Task/t:Actions/t:Exec/t:Command").Equals(Path.Combine(Base,"runtime","node.exe"),StringComparison.OrdinalIgnoreCase),"TASK_REGISTRATION_INVALID");
   Need(Single(xml,ns,"/t:Task/t:Actions/t:Exec/t:Arguments")==Quote(Path.Combine(Base,"app","clock-fleet","gateway.mjs"))+" run --config "+Quote(Path.Combine(Base,"config","gateway.json")),"TASK_REGISTRATION_INVALID");
   Need(Single(xml,ns,"/t:Task/t:Actions/t:Exec/t:WorkingDirectory").Equals(Base,StringComparison.OrdinalIgnoreCase),"TASK_REGISTRATION_INVALID");
   Need(xml.SelectNodes("/t:Task/t:Actions/*",ns).Count==1&&Single(xml,ns,"/t:Task/t:Principals/t:Principal/t:UserId")=="S-1-5-19"&&Single(xml,ns,"/t:Task/t:Principals/t:Principal/t:LogonType")=="ServiceAccount"&&Single(xml,ns,"/t:Task/t:Settings/t:MultipleInstancesPolicy")=="IgnoreNew","TASK_REGISTRATION_INVALID");
  }
  static Inspection Inspect(){
   var result=new Inspection();NoReparse(Base);result.Installed=Directory.Exists(Base);
   foreach(var parent in new[]{Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData)}){
    foreach(var tail in new[]{"MuniControl/Gateways/MultiClock","MuniControl/Gateways/MultiClockSource","MuniControl/Gateways/PM10","MuniControl/PM10"}){
     string p=Path.Combine(parent,tail.Replace('/',Path.DirectorySeparatorChar));NoReparse(p);if(Directory.Exists(p)){result.Legacy=true;string status=Path.Combine(p,"estado.html");if(result.Existing==null&&File.Exists(status)){NoReparse(status);result.Existing=status;}}
    }
   }
   object service=null,folder=null,tasks=null;
   try{folder=TaskFolder(out service);tasks=Call(folder,"GetTasks",1);foreach(object task in (IEnumerable)tasks)try{
    string name=(string)Get(task,"Name");if(name==TaskName){ValidateTask(task);result.MachineTask=true;}else if(name.StartsWith("MuniControl",StringComparison.OrdinalIgnoreCase))result.Legacy=true;
   }finally{Free(task);}}
   catch(SetupFault){throw;}catch{throw new SetupFault("SCHEDULER_INSPECTION_REQUIRED");}finally{Free(tasks);Free(folder);Free(service);}
   try{using(var query=new ManagementObjectSearcher("SELECT CommandLine FROM Win32_Process WHERE Name='node.exe' OR Name='wscript.exe' OR Name='cscript.exe'"))using(var processes=query.Get())foreach(ManagementObject p in processes)using(p){
    string command=p["CommandLine"] as string;Need(!String.IsNullOrWhiteSpace(command),"PROCESS_INSPECTION_REQUIRED");command=command.Replace('\\','/').ToLowerInvariant();
    bool clock=command.Contains("/clock-fleet/")||command.Contains("/pm10/")||command.Contains("/capture-cycle.vbs")||command.Contains("/source-cycle.vbs")||command.Contains("/lector-fichadas.mjs");
    if(clock&&!command.Contains(Base.Replace('\\','/').ToLowerInvariant()+"/"))result.Legacy=true;
   }}catch{throw new SetupFault("PROCESS_INSPECTION_REQUIRED");}
   if(result.Installed){VerifyInstalled(Base);result.Configured=File.Exists(Path.Combine(Base,"config","gateway.json"));if(result.Configured){NoTreeReparse(Path.Combine(Base,"config"));var answer=Node(Base,new[]{Path.Combine(Base,"app","clock-fleet","gateway.mjs"),"check","--config",Path.Combine(Base,"config","gateway.json")});Need(answer.ExitCode==0,"CONFIGURATION_INVALID");var v=Object(Encoding.UTF8.GetBytes(answer.Output));object count,senders;
    Need(v.TryGetValue("captureIdentities",out count)&&Convert.ToInt32(count)>0&&v.TryGetValue("allSendersConfigured",out senders)&&senders is bool&&(bool)senders,"CONFIGURATION_INCOMPLETE");
   }}
   return result;
  }
  internal static string Quote(string value){Need(value!=null&&value.IndexOf('\0')<0&&value.IndexOf('\r')<0&&value.IndexOf('\n')<0,"ARGUMENT_INVALID");var b=new StringBuilder("\"");int slash=0;foreach(char c in value){if(c=='\\'){slash++;continue;}if(c=='"'){b.Append('\\',slash*2+1);b.Append(c);slash=0;continue;}b.Append('\\',slash);slash=0;b.Append(c);}b.Append('\\',slash*2);b.Append('"');return b.ToString();}
  static ProcessAnswer Node(string root,string[] args){
   string node=Path.Combine(root,"runtime","node.exe");VerifyNode(node);var a=new List<string>();foreach(var s in args)a.Add(Quote(s));
   var info=new ProcessStartInfo(node,String.Join(" ",a.ToArray())){UseShellExecute=false,CreateNoWindow=true,WorkingDirectory=root,RedirectStandardOutput=true,RedirectStandardError=true};
   using(var p=new Process()){p.StartInfo=info;var output=new StringBuilder();bool large=false;p.OutputDataReceived+=(s,e)=>{if(e.Data!=null)lock(output){if(output.Length+e.Data.Length>65536)large=true;else output.AppendLine(e.Data);}};p.ErrorDataReceived+=(s,e)=>{};
    p.Start();p.BeginOutputReadLine();p.BeginErrorReadLine();if(!p.WaitForExit(30000)){try{p.Kill();}catch{}throw new SetupFault("LOCAL_CHECK_TIMEOUT");}p.WaitForExit();Need(!large,"LOCAL_CHECK_INVALID");return new ProcessAnswer{ExitCode=p.ExitCode,Output=output.ToString().Trim()};}
  }
  static BackendResult Result(bool success,string code,string summary){return new BackendResult{Success=success,Code=code,Summary=summary,InstallPath=Base,AppVersion=PackagePins.ProductVersion};}
  static BackendResult Error(Exception e){var f=e as SetupFault;string code=f==null?"OPERATION_REVIEW_REQUIRED":f.Code;
   var r=Result(false,code,Messages(code));r.CanActivate=false;return r;
  }
  static string Messages(string code){switch(code){
   case "ADMIN_REQUIRED":return "Windows necesita autorización de administrador para esta operación.";
   case "LEGACY_INSTALLATION_DETECTED":return "Esta PC ya tiene un lector MuniControl. Conserve la instalación actual y revise su estado.";
   case "INSTALLATION_EXISTS":return "La carpeta de instalación ya existe. Este instalador inicial no la sobrescribe.";
   case "CONFIGURATION_REQUIRED":case "CONFIGURATION_INCOMPLETE":return "Falta la configuración privada verificada de esta instalación. El borrador no conecta relojes.";
   case "MACHINE_REGISTRATION_REQUIRED":return "La configuración debe ser revisada y registrada como servicio antes de activarla.";
   case "ORIGIN_STOP_CONFIRMATION_REQUIRED":return "Confirme que el lector anterior y su VPN dejaron de operar antes de activar este equipo.";
   case "DRAFT_INVALID":return "Revise municipio, direcciones, series y protocolo. No se guardaron cambios operativos.";
   case "DRAFT_CURRENT_NETWORK_INVALID":return "El perfil actual sólo admite la red municipal verificada. Otro municipio requiere un borrador y validación del adaptador.";
   case "DISK_SPACE_LOW":return "Falta espacio para instalar y verificar los archivos sin afectar datos existentes.";
   case "NODE_SIGNATURE_INVALID":case "NODE_PUBLISHER_INVALID":case "NODE_HASH_MISMATCH":return "No se pudo verificar el runtime oficial de Node. No se instalará ni ejecutará.";
   case "REPARSE_POINT_DENIED":return "La ruta contiene una redirección de archivos. Requiere revisión antes de continuar.";
   default:return "No se pudo completar la comprobación segura. Conserve el estado actual y revise el diagnóstico.";
  }}
  static BackendResult CheckInternal(){
   Need(Environment.OSVersion.Platform==PlatformID.Win32NT&&Environment.Is64BitOperatingSystem,"WINDOWS_X64_REQUIRED");var i=Inspect();
   var r=Result(true,i.Legacy?"LEGACY_INSTALLATION_DETECTED":i.Installed?"INSTALLED":"READY_TO_INSTALL",i.Legacy?Messages("LEGACY_INSTALLATION_DETECTED"):i.Installed?"Archivos instalados y verificados. La activación es un paso separado.":"Este equipo puede preparar una instalación nueva, sin activar relojes.");
   r.Installed=i.Installed;r.LegacyDetected=i.Legacy;r.ExistingStatusPath=i.Existing;r.Configured=i.Configured;r.CanActivate=i.Installed&&i.Configured&&i.MachineTask&&!i.Legacy;
   if(i.Installed)r.GuidePath=Path.Combine(Base,"LEEME-PRIMERO.html");
   r.Details.Add("No se realizó una lectura de relojes ni una escritura en Vercel o Neon.");if(i.Installed&&!i.Configured)r.Details.Add(Messages("CONFIGURATION_REQUIRED"));if(i.Configured&&!i.MachineTask)r.Details.Add(Messages("MACHINE_REGISTRATION_REQUIRED"));
   return r;
  }
  public static BackendResult Check(){lock(Gate){try{return CheckInternal();}catch(Exception e){return Error(e);}}}
  public static BackendResult Diagnose(){return Check();}
  public static BackendResult GetStatus(){return Check();}
  public static BackendResult Install(){lock(Gate){string stage=null;try{
   Need(Admin(),"ADMIN_REQUIRED");Need(Environment.Is64BitOperatingSystem,"WINDOWS_X64_REQUIRED");var before=Inspect();Need(!before.Legacy,"LEGACY_INSTALLATION_DETECTED");Need(!before.Installed,"INSTALLATION_EXISTS");
   Need(PackagePins.ExpandedBytes>0&&PackagePins.ExpandedBytes<=MaxExpanded&&PackagePins.PayloadBytes>0&&PackagePins.PayloadBytes<=MaxPayload,"PACKAGE_SIZE_INVALID");
   string parent=Path.GetDirectoryName(Base);NoReparse(parent);var drive=new DriveInfo(Path.GetPathRoot(Base));Need(drive.AvailableFreeSpace>PackagePins.ExpandedBytes+256L*1024*1024,"DISK_SPACE_LOW");
   if(!Directory.Exists(parent))ProtectedDirectory(parent,false);ProtectedParent(parent);stage=Path.Combine(parent,".ClockGateway-install-"+Guid.NewGuid().ToString("N"));ProtectedDirectory(stage,false);
   ExtractPinnedPayload(stage);VerifyInstalled(stage);
   var version=Node(stage,new[]{"-p","process.version+'|'+process.platform+'|'+process.arch"});Need(version.ExitCode==0&&version.Output=="v"+PackagePins.NodeVersion.TrimStart('v')+"|win32|x64","NODE_RUNTIME_INVALID");
   before=Inspect();Need(!before.Legacy&&!before.Installed&&!Directory.Exists(Base)&&!File.Exists(Base),"INSTALLATION_CHANGED");ProtectedParent(parent);NoTreeReparse(stage);
   Directory.Move(stage,Base);stage=null;VerifyInstalled(Base);
   var r=Result(true,"INSTALLED_STOPPED","Instalación preparada. Los relojes siguen detenidos hasta completar su configuración privada.");r.Installed=true;r.GuidePath=Path.Combine(Base,"LEEME-PRIMERO.html");r.Details.Add("No se crearon tareas, credenciales, identidades ni conexiones municipales.");r.Details.Add("La versión actual conserva el adaptador y el destino verificados de Junín; otros municipios sólo pueden preparar un borrador.");return r;
  }catch(Exception e){var r=Error(e);if(stage!=null)r.Details.Add("Se conservó una carpeta temporal de instalación para revisión; no se reemplazó la instalación anterior.");return r;}}}
  public static void ConfirmSourceStopped(bool confirmed){lock(Gate){sourceStoppedConfirmed=confirmed;}}
  public static BackendResult Activate(){lock(Gate){object service=null,folder=null,task=null;bool desiredStarted=false;try{
   Need(Admin(),"ADMIN_REQUIRED");Need(sourceStoppedConfirmed,"ORIGIN_STOP_CONFIRMATION_REQUIRED");sourceStoppedConfirmed=false;
   var current=CheckInternal();Need(!current.LegacyDetected,"LEGACY_INSTALLATION_DETECTED");Need(current.Installed&&current.Configured,"CONFIGURATION_REQUIRED");Need(current.CanActivate,"MACHINE_REGISTRATION_REQUIRED");
   folder=TaskFolder(out service);task=Call(folder,"GetTask",TaskName);ValidateTask(task);Need(!(bool)Get(task,"Enabled")&&(int)Get(task,"State")!=4,"TASK_ALREADY_ENABLED");
   var answer=Node(Base,new[]{Path.Combine(Base,"app","clock-fleet","gateway.mjs"),"start","--config",Path.Combine(Base,"config","gateway.json")});Need(answer.ExitCode==0&&answer.Output=="GATEWAY_START_ENABLED","START_NOT_VERIFIED");desiredStarted=true;
   Set(task,"Enabled",true);Call(task,"Run",new object[]{null});var r=Result(true,"ACTIVATION_REQUESTED","Se solicitó el inicio del coordinador. Falta comprobar una captura y su acuse real.");r.Installed=true;r.Configured=true;r.Details.Add("Iniciar no acredita que todos los relojes estén conectados ni que se hayan actualizado datos municipales.");return r;
  }catch(Exception e){if(desiredStarted){try{Node(Base,new[]{Path.Combine(Base,"app","clock-fleet","gateway.mjs"),"stop","--config",Path.Combine(Base,"config","gateway.json")});}catch{}try{if(task!=null)Set(task,"Enabled",false);}catch{}}return Error(e);}finally{Free(task);Free(folder);Free(service);}}}
  static bool PlainText(string text,int max){return !String.IsNullOrWhiteSpace(text)&&text.Length<=max&&text.Trim()==text&&!Regex.IsMatch(text,"[\\x00-\\x1f\\x7f]");}
  static bool IPv4(string host,out byte[] parts){parts=new byte[4];if(host==null)return false;var bits=host.Split('.');if(bits.Length!=4)return false;for(int i=0;i<4;i++)if(!Regex.IsMatch(bits[i],"^(0|[1-9][0-9]{0,2})$")||!Byte.TryParse(bits[i],NumberStyles.None,CultureInfo.InvariantCulture,out parts[i]))return false;return parts[0]!=0&&parts[0]!=127&&parts[0]<224;}
  static void Validate(InstallationDraft draft){
   Need(draft!=null&&PlainText(draft.MunicipalityName,100)&&(draft.TargetEnvironment=="current"||draft.TargetEnvironment=="other-draft")&&draft.Clocks!=null&&draft.Clocks.Count>=1&&draft.Clocks.Count<=16,"DRAFT_INVALID");
   var addresses=new HashSet<string>(StringComparer.Ordinal);var serials=new HashSet<string>(StringComparer.OrdinalIgnoreCase);
   foreach(var clock in draft.Clocks){byte[] ip;Need(clock!=null&&PlainText(clock.Location,100)&&IPv4(clock.Host,out ip)&&clock.Port==4370&&clock.Protocol=="zk40-tcp"&&clock.Serial!=null&&Regex.IsMatch(clock.Serial,"^[A-Za-z0-9][A-Za-z0-9._-]{0,127}\\z")&&addresses.Add(clock.Host+":"+clock.Port)&&serials.Add(clock.Serial),"DRAFT_INVALID");
    if(draft.TargetEnvironment=="current"){IPv4(clock.Host,out ip);Need(ip[0]==172&&ip[1]==100&&ip[2]>=96&&ip[2]<=127,"DRAFT_CURRENT_NETWORK_INVALID");}
   }
  }
  public static BackendResult ValidateDraft(InstallationDraft draft){try{Validate(draft);var r=Result(true,"DRAFT_VALID","Borrador válido. No autoriza conectividad ni crea una configuración operativa.");r.Draft=draft;return r;}catch(Exception e){return Error(e);}}
  public static BackendResult SaveDraft(InstallationDraft draft){lock(Gate){try{
   Validate(draft);NoReparse(DraftRoot);ProtectedDirectory(DraftRoot,true);string file=Path.Combine(DraftRoot,"installation-draft.json"),temp=Path.Combine(DraftRoot,"draft-"+Guid.NewGuid().ToString("N")+".tmp");NoReparse(file);
   var record=new Dictionary<string,object>{{"schema","municipal-clock-installation-draft.v1"},{"operational",false},{"createdAt",DateTime.UtcNow.ToString("o",CultureInfo.InvariantCulture)},{"draft",draft}};
   byte[] bytes=new UTF8Encoding(false).GetBytes(Json().Serialize(record));Need(bytes.Length<=65536,"DRAFT_INVALID");using(var output=new FileStream(temp,FileMode.CreateNew,FileAccess.Write,FileShare.None)){output.Write(bytes,0,bytes.Length);output.Flush(true);}
   if(File.Exists(file))File.Replace(temp,file,null);else File.Move(temp,file);
   Need(HashFile(file)==Hash(bytes),"DRAFT_WRITE_UNCONFIRMED");var r=Result(true,"DRAFT_SAVED","Borrador guardado en forma privada. No se modificó la instalación ni se contactaron relojes.");r.Draft=draft;r.DraftSavedPath=file;return r;
  }catch(Exception e){return Error(e);}}}
  public static BackendResult LoadDraft(){lock(Gate){try{string file=Path.Combine(DraftRoot,"installation-draft.json");NoReparse(file);if(!File.Exists(file))return Result(true,"DRAFT_EMPTY","Todavía no hay un borrador guardado.");var record=Object(ReadFile(file,65536));object operational,d=null;
   Need(Text(record,"schema")=="municipal-clock-installation-draft.v1"&&record.TryGetValue("operational",out operational)&&operational is bool&&!(bool)operational&&record.TryGetValue("draft",out d),"DRAFT_INVALID");
   var draft=Json().ConvertToType<InstallationDraft>(d);Validate(draft);var r=Result(true,"DRAFT_LOADED","Borrador recuperado. La configuración operativa permanece sin cambios.");r.Draft=draft;r.DraftSavedPath=file;return r;
  }catch(Exception e){return Error(e);}}}
  static void ExpectFault(Action action,string code){bool failed=false;try{action();}catch(SetupFault e){failed=e.Code==code;}Need(failed,"SELF_TEST_FAILED");}
  static void TestZip(string[] names,int[] attributes,string expected){
   using(var memory=new MemoryStream()){
    using(var archive=new ZipArchive(memory,ZipArchiveMode.Create,true)){for(int i=0;i<names.Length;i++){var entry=archive.CreateEntry(names[i]);entry.ExternalAttributes=attributes[i];using(var stream=entry.Open())stream.WriteByte(42);}}
    memory.Position=0;using(var archive=new ZipArchive(memory,ZipArchiveMode.Read,true)){if(expected==null)Need(ZipEntries(archive).Count==names.Length,"SELF_TEST_FAILED");else ExpectFault(()=>{ZipEntries(archive);},expected);}
   }
  }
  public static BackendResult SelfTest(){string fixture=null;BackendResult result;try{
   int checks=0;foreach(string p in new[]{"../x","/x","C:/x","app/../x","app//x","app/x.","app/CON.txt","app/COM1.mjs","app/x:stream","app\\x","app/x\n","app/"}){Need(!SafeRelative(p),"SELF_TEST_FAILED");checks++;}
   foreach(string p in AppFiles){Need(SafeRelative(p),"SELF_TEST_FAILED");checks++;}
   Need(Quote("C:\\a b\\")=="\"C:\\a b\\\\\""&&Quote("a\"b")=="\"a\\\"b\"","SELF_TEST_FAILED");checks+=2;
   var d=new InstallationDraft{MunicipalityName="Municipio de prueba",TargetEnvironment="current",Clocks=new List<ClockDraft>{new ClockDraft{Location="Equipo sintético",Host="172.100.96.2",Port=4370,Serial="SYNTHETIC-ONLY",Protocol="zk40-tcp"}}};Validate(d);checks++;
   d.Clocks[0].Host="10.0.0.1";Need(!ValidateDraft(d).Success,"SELF_TEST_FAILED");checks++;d.TargetEnvironment="other-draft";Validate(d);checks++;
   d.Clocks.Add(d.Clocks[0]);Need(!ValidateDraft(d).Success,"SELF_TEST_FAILED");checks++;
   TestZip(new[]{"app/a.mjs"},new[]{0},null);checks++;
   TestZip(new[]{"app/../outside"},new[]{0},"PACKAGE_PATH_INVALID");checks++;
   TestZip(new[]{"app/a.mjs","app/A.mjs"},new[]{0,0},"PACKAGE_PATH_INVALID");checks++;
   TestZip(new[]{"app/link"},new[]{unchecked((int)0xA0000000)},"PACKAGE_LINK_DENIED");checks++;
   TestZip(new[]{"app/link"},new[]{0x400},"PACKAGE_LINK_DENIED");checks++;
   string temp=Path.GetFullPath(Path.GetTempPath());NoReparse(temp);fixture=Path.Combine(temp,"MuniControl-InstallerSelfTest-"+Guid.NewGuid().ToString("N"));ProtectedDirectory(fixture,true);
   var pins=ExtractPinnedPayload(fixture);VerifyInstalled(fixture);checks+=pins.Count+3;
   string probe=Inside(fixture,"app/clock-fleet/runner.mjs");byte[] original=File.ReadAllBytes(probe);File.WriteAllBytes(probe,new byte[]{42});ExpectFault(()=>VerifyInstalled(fixture),"INSTALLED_FILES_CHANGED");File.WriteAllBytes(probe,original);checks++;
   string extra=Inside(fixture,"app/clock-fleet/unexpected.mjs");File.WriteAllBytes(extra,new byte[]{42});ExpectFault(()=>VerifyInstalled(fixture),"INSTALLED_FILES_CHANGED");File.Delete(extra);checks++;
   bool overwriteDenied=false;try{ExtractPinnedPayload(fixture);}catch(IOException){overwriteDenied=true;}Need(overwriteDenied,"SELF_TEST_FAILED");VerifyInstalled(fixture);checks++;
   result=Result(true,"SELF_TEST_PASSED","Payload extraído y verificado en una carpeta temporal privada. Firma de Node y archivos correctos; ninguna instalación real fue modificada.");result.Details.Add(checks.ToString(CultureInfo.InvariantCulture)+" comprobaciones; sin relojes, tareas, configuración privada, ejecución de Node ni elevación.");
  }catch(Exception e){result=Error(e);}try{if(fixture!=null){
   string full=Path.GetFullPath(fixture),parent=Path.GetFullPath(Path.GetTempPath()).TrimEnd(Path.DirectorySeparatorChar);
   Need(String.Equals(Path.GetDirectoryName(full).TrimEnd(Path.DirectorySeparatorChar),parent,StringComparison.OrdinalIgnoreCase)&&Path.GetFileName(full).StartsWith("MuniControl-InstallerSelfTest-",StringComparison.Ordinal),"SELF_TEST_CLEANUP_UNSAFE");
   if(Directory.Exists(full)){NoTreeReparse(full);Directory.Delete(full,true);}
  }}catch{result=Error(new SetupFault("SELF_TEST_CLEANUP_REQUIRED"));}return result;}
 }
}
