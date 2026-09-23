// SPDX-License-Identifier: GPL-2.0-only
// Native Windows UI. All installation and activation decisions remain in SetupBackend.
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.Reflection;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using System.Windows.Forms;
using System.Web.Script.Serialization;

namespace MuniControl.Setup
{
    internal static class Program
    {
        [STAThread]
        private static int Main(string[] args)
        {
            if (args.Length > 0 && args[0] == "--diagnose")
            {
                try
                {
                    // Resolve and reject existing/redirected destinations before consulting the host.
                    if (args.Length != 3 || args[1] != "--output" || !SafeNewOutput(args[2], ".json")) return 2;
                    BackendResult result;
                    try { result = SetupBackend.Diagnose(); }
                    catch { result = new BackendResult { Success = false, Code = "DIAGNOSIS_NOT_COMPLETED" }; }
                    string json = new JavaScriptSerializer().Serialize(DiagnosticReport(result));
                    using (FileStream file = new FileStream(args[2], FileMode.CreateNew, FileAccess.Write, FileShare.None))
                    using (StreamWriter writer = new StreamWriter(file)) writer.Write(json + Environment.NewLine);
                    bool ok = result != null && result.Success;
                    Console.WriteLine(ok ? "MUNICONTROL_DIAGNOSE_OK" : "MUNICONTROL_DIAGNOSE_FAILED");
                    return ok ? 0 : 1;
                }
                catch { Console.WriteLine("MUNICONTROL_DIAGNOSE_FAILED"); return 1; }
            }
            if (args.Length > 0 && args[0] == "--self-test")
            {
                try
                {
                    if (args.Length != 1 && !(args.Length == 3 && args[1] == "--output")) return 2;
                    string output = args.Length == 3 ? args[2] : null;
                    if (output != null && !SafeNewOutput(output, ".json")) return 2;
                    BackendResult result = SetupBackend.SelfTest();
                    bool ui = SetupForm.SelfTest();
                    bool ok = result != null && result.Success && ui;
                    if (output != null)
                    {
                        string json = new JavaScriptSerializer().Serialize(new { ok = ok, backendOk = result != null && result.Success,
                            uiGuardsOk = ui, installationActions = false, temporaryTestFilesOnly = true, networkAccess = false, formsShown = false });
                        using (FileStream file = new FileStream(output, FileMode.CreateNew, FileAccess.Write, FileShare.None))
                        using (StreamWriter writer = new StreamWriter(file)) writer.Write(json + Environment.NewLine);
                    }
                    Console.WriteLine(ok ? "MUNICONTROL_SELF_TEST_OK" : "MUNICONTROL_SELF_TEST_FAILED");
                    return ok ? 0 : 1;
                }
                catch { Console.WriteLine("MUNICONTROL_SELF_TEST_FAILED"); return 1; }
            }

            // An explicit offline rendering mode uses synthetic UI state, never the backend.
            // It exists for package QA; it cannot install, configure, read a collector or activate.
            if (args.Length >= 1 && args[0] == "--render-preview")
            {
                try
                {
                    if (args.Length != 2 && !(args.Length == 4 && args[2] == "--page")) return 2;
                    string destination = args[1];
                    string page = args.Length == 4 ? args[3] : "welcome";
                    if (!SafeNewOutput(destination, ".png")) return 2;
                    if (page != "welcome" && page != "configuration" && page != "status" && page != "existing") return 2;
                    Application.EnableVisualStyles();
                    Application.SetCompatibleTextRenderingDefault(false);
                    using (SetupForm form = new SetupForm(true))
                    {
                        form.PreparePreview(page);
                        form.PreparePreviewHandles();
                        using (Bitmap bitmap = new Bitmap(form.Width, form.Height))
                        {
                            form.DrawToBitmap(bitmap, new Rectangle(Point.Empty, form.Size));
                            using (FileStream output = new FileStream(destination, FileMode.CreateNew, FileAccess.Write, FileShare.None))
                                bitmap.Save(output, ImageFormat.Png);
                        }
                    }
                    return 0;
                }
                catch { return 1; }
            }
            if (args.Length != 0) return 2;

            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.SetUnhandledExceptionMode(UnhandledExceptionMode.CatchException);
            Application.ThreadException += delegate
            {
                MessageBox.Show("No se pudo completar esta acción. Cerrá y volvé a abrir el asistente para consultar el estado.",
                    "MuniControl", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            };
            Application.Run(new SetupForm(false));
            return 0;
        }

        private static bool SafeNewOutput(string path, string extension)
        {
            try
            {
                if (String.IsNullOrEmpty(path) || !Regex.IsMatch(path, @"\A[A-Za-z]:[\\/]") ||
                    Path.GetExtension(path).ToLowerInvariant() != extension || File.Exists(path) || Directory.Exists(path)) return false;
                string parent = Path.GetDirectoryName(Path.GetFullPath(path));
                if (!Directory.Exists(parent)) return false;
                while (!String.IsNullOrEmpty(parent))
                {
                    if ((File.GetAttributes(parent) & FileAttributes.ReparsePoint) != 0) return false;
                    parent = Path.GetDirectoryName(parent);
                }
                return true;
            }
            catch { return false; }
        }

        internal static object DiagnosticReport(BackendResult result)
        {
            // Closed projection: never serialize BackendResult directly. It can contain local paths
            // or a saved draft; neither belongs in a shareable diagnostic receipt.
            string code = result == null ? null : result.Code;
            if (String.IsNullOrEmpty(code) || !Regex.IsMatch(code, @"\A[A-Z][A-Z0-9_]{0,79}\z")) code = "DIAGNOSIS_NOT_COMPLETED";
            string version = result == null ? null : result.AppVersion;
            if (String.IsNullOrEmpty(version) || !Regex.IsMatch(version, @"\A[0-9]{1,4}(\.[0-9]{1,4}){1,3}\z")) version = null;
            return new { schema = "municontrol-installer-diagnosis.v1", checkedAt = DateTime.UtcNow.ToString("o"),
                ok = result != null && result.Success, code = code, appVersion = version,
                installed = result != null && result.Installed, legacyDetected = result != null && result.LegacyDetected,
                configured = result != null && result.Configured, canActivate = result != null && result.CanActivate,
                existingStatusAvailable = result != null && !String.IsNullOrEmpty(result.ExistingStatusPath),
                guideAvailable = result != null && !String.IsNullOrEmpty(result.GuidePath),
                readOnly = true, installationActions = false, activationActions = false, draftWrites = false,
                deviceConnections = false, formsShown = false };
        }
    }

    internal sealed class SetupForm : Form
    {
        private enum Page { Welcome, Check, Configuration, Installation, Status }
        private static readonly Color Ink = Color.FromArgb(20, 44, 48);
        private static readonly Color Muted = Color.FromArgb(84, 104, 109);
        private static readonly Color Teal = Color.FromArgb(0, 109, 105);
        private static readonly Color Line = Color.FromArgb(221, 232, 231);
        private static readonly Color Pale = Color.FromArgb(240, 247, 246);
        private const string Portal = "https://municipio-junin-friendly.vercel.app/relojes";
        private readonly bool preview;
        private readonly FlowLayoutPanel content = new FlowLayoutPanel();
        private readonly Panel sidebar = new Panel();
        private readonly Panel footer = new Panel();
        private readonly Button primary = new Button();
        private readonly Button back = new Button();
        private readonly Label activity = new Label();
        private readonly ProgressBar progress = new ProgressBar();
        private readonly List<Control> wideControls = new List<Control>();
        private readonly Dictionary<Page, Button> navigation = new Dictionary<Page, Button>();
        private readonly ToolTip hints = new ToolTip();
        private Page page;
        private bool busy;
        private bool configurationLoaded;
        private bool configurationDirty;
        private Action primaryAction;
        private BackendResult machine;
        private InstallationDraft draft;
        private TextBox municipality;
        private ComboBox environment;
        private DataGridView clocks;
        private Label draftNotice;
        private CheckBox stopped;

        internal SetupForm(bool previewMode)
        {
            preview = previewMode;
            Text = "MuniControl · Asistente de relojes";
            Name = "MuniControlSetup";
            StartPosition = FormStartPosition.CenterScreen;
            ClientSize = new Size(1080, 770);
            MinimumSize = new Size(940, 700);
            AutoScaleMode = AutoScaleMode.Dpi;
            Font = new Font("Segoe UI", 10F);
            BackColor = Color.White;
            ForeColor = Ink;
            BuildChrome();
            if (!preview)
            {
                Rectangle area = Screen.FromControl(this).WorkingArea;
                Size = new Size(Math.Min(Width, Math.Max(MinimumSize.Width, area.Width - 32)),
                    Math.Min(Height, Math.Max(MinimumSize.Height, area.Height - 32)));
            }
            Resize += delegate { FitContent(); };
            FormClosing += delegate(object sender, FormClosingEventArgs e)
            {
                if (busy)
                {
                    e.Cancel = true;
                    MessageBox.Show(this, "Esperá a que termine la comprobación o instalación. El resultado aparecerá en esta ventana.",
                        "Acción en curso", MessageBoxButtons.OK, MessageBoxIcon.Information);
                }
                else if (configurationDirty && MessageBox.Show(this,
                    "Hay cambios de configuración sin guardar. ¿Querés cerrar el asistente?", "Borrador sin guardar",
                    MessageBoxButtons.YesNo, MessageBoxIcon.Question) != DialogResult.Yes) e.Cancel = true;
            };
            ShowPage(Page.Welcome);
        }

        private void BuildChrome()
        {
            sidebar.Dock = DockStyle.Left;
            sidebar.Width = 236;
            sidebar.BackColor = Ink;
            Controls.Add(sidebar);

            PictureBox logo = new PictureBox();
            logo.Location = new Point(25, 28);
            logo.Size = new Size(48, 48);
            logo.SizeMode = PictureBoxSizeMode.Zoom;
            logo.AccessibleName = "Logo de MuniControl";
            try
            {
                using (Stream stream = Assembly.GetExecutingAssembly().GetManifestResourceStream("MuniControl.Logo.png"))
                    if (stream != null) using (Image image = Image.FromStream(stream)) logo.Image = new Bitmap(image);
                Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath);
            }
            catch { /* Text branding is always available. */ }
            sidebar.Controls.Add(logo);
            Label brand = new Label();
            brand.Text = "MuniControl";
            brand.Font = new Font("Segoe UI", 16F, FontStyle.Bold);
            brand.ForeColor = Color.White;
            brand.Location = new Point(80, 31);
            brand.Size = new Size(153, 31);
            sidebar.Controls.Add(brand);
            Label brandSub = new Label();
            brandSub.Text = "Relojes municipales";
            brandSub.ForeColor = Color.FromArgb(185, 217, 212);
            brandSub.Location = new Point(81, 62);
            brandSub.Size = new Size(151, 20);
            brandSub.Font = new Font("Segoe UI", 9F);
            sidebar.Controls.Add(brandSub);

            AddNavigation(Page.Welcome, "1   Bienvenida", 132);
            AddNavigation(Page.Check, "2   Este equipo", 184);
            AddNavigation(Page.Configuration, "3   Mis relojes", 236);
            AddNavigation(Page.Installation, "4   Instalar", 288);
            AddNavigation(Page.Status, "5   Estado", 340);
            Label assurance = new Label();
            assurance.Text = "Vos elegís cuándo activar.\r\nInstalar no inicia la lectura\r\nde los relojes.";
            assurance.ForeColor = Color.FromArgb(202, 226, 222);
            assurance.Font = new Font("Segoe UI", 9F);
            assurance.Location = new Point(27, 616);
            assurance.Size = new Size(185, 66);
            assurance.Anchor = AnchorStyles.Left | AnchorStyles.Bottom;
            sidebar.Controls.Add(assurance);
            Button help = LinkButton("Ayuda y guía de uso", delegate { ShowHelp(); });
            help.ForeColor = Color.White;
            help.Location = new Point(22, 710);
            help.Size = new Size(194, 37);
            help.Anchor = AnchorStyles.Left | AnchorStyles.Bottom;
            sidebar.Controls.Add(help);

            Panel main = new Panel();
            main.Dock = DockStyle.Fill;
            Controls.Add(main);
            main.BringToFront();
            footer.Dock = DockStyle.Bottom;
            footer.Height = 88;
            footer.BackColor = Color.White;
            footer.Paint += delegate(object sender, PaintEventArgs e)
            {
                using (Pen pen = new Pen(Line)) e.Graphics.DrawLine(pen, 0, 0, footer.Width, 0);
            };
            main.Controls.Add(footer);
            StyleButton(primary, true);
            primary.Name = "primaryAction";
            primary.Anchor = AnchorStyles.Right | AnchorStyles.Bottom;
            primary.Size = new Size(240, 44);
            primary.Location = new Point(footer.Width - 270, 25);
            primary.Click += delegate { if (!busy && primaryAction != null) primaryAction(); };
            footer.Controls.Add(primary);
            StyleButton(back, false);
            back.Text = "Volver";
            back.Location = new Point(30, 25);
            back.Size = new Size(106, 44);
            back.Click += delegate { if (!busy) ShowPage(page == Page.Check ? Page.Welcome : Page.Check); };
            footer.Controls.Add(back);
            AcceptButton = primary;

            content.Dock = DockStyle.Fill;
            content.AutoScroll = true;
            content.WrapContents = false;
            content.FlowDirection = FlowDirection.TopDown;
            content.Padding = new Padding(32, 29, 26, 28);
            main.Controls.Add(content);
            content.BringToFront();
            activity.Text = "Trabajando…";
            activity.Font = new Font("Segoe UI", 9F);
            activity.ForeColor = Muted;
            activity.AutoSize = true;
            progress.Style = ProgressBarStyle.Marquee;
            progress.MarqueeAnimationSpeed = 25;
            progress.Height = 7;
        }

        private void AddNavigation(Page target, string caption, int top)
        {
            Button button = new Button();
            button.Text = caption;
            button.Name = "navigate" + target;
            button.TextAlign = ContentAlignment.MiddleLeft;
            button.FlatStyle = FlatStyle.Flat;
            button.FlatAppearance.BorderSize = 0;
            button.ForeColor = Color.White;
            button.BackColor = Ink;
            button.Location = new Point(15, top);
            button.Size = new Size(205, 45);
            button.Padding = new Padding(12, 0, 0, 0);
            button.Cursor = Cursors.Hand;
            button.Click += delegate
            {
                if (busy) return;
                if (target == Page.Installation && machine == null) { ShowPage(Page.Check); return; }
                ShowPage(target);
            };
            sidebar.Controls.Add(button);
            navigation.Add(target, button);
        }

        private void ShowPage(Page target)
        {
            if (busy) return;
            if (page == Page.Configuration && clocks != null)
            {
                InstallationDraft input;
                if (!TryReadDraft(out input, false)) return;
                draft = input;
            }
            if (!preview) SetupBackend.ConfirmSourceStopped(false);
            stopped = null;
            page = target;
            // Dispose old controls: form drafts remain only in the dedicated DTO.
            while (content.Controls.Count > 0)
            {
                Control old = content.Controls[0];
                content.Controls.Remove(old);
                if (old != activity && old != progress) old.Dispose();
            }
            wideControls.Clear();
            municipality = null; environment = null; clocks = null; draftNotice = null;
            primaryAction = null;
            primary.Enabled = true;
            back.Visible = target != Page.Welcome;
            foreach (KeyValuePair<Page, Button> item in navigation)
                item.Value.BackColor = item.Key == target ? Teal : Ink;
            if (target == Page.Welcome) WelcomePage();
            else if (target == Page.Check) CheckPage();
            else if (target == Page.Configuration) ConfigurationPage();
            else if (target == Page.Installation) InstallationPage();
            else StatusPage();
            FitContent();
            content.AutoScrollPosition = Point.Empty;
        }

        private void WelcomePage()
        {
            Eyebrow("ASISTENTE PARA WINDOWS 11");
            Heading("Tus relojes,\r\ncon un lugar de control.");
            Paragraph("Instalá las herramientas de MuniControl y prepará este equipo paso a paso. El asistente reconoce si ya hay un colector en funcionamiento.");
            Card("1 · Comprobamos este equipo", "Revisamos la instalación y evitamos que dos colectores lean los mismos relojes.", false);
            Card("2 · Preparás tus relojes", "Indicás la ubicación y los datos del equipo. La conexión privada se valida por separado.", false);
            Card("3 · Instalás y consultás el estado", "El paquete incluye el motor necesario. La lectura permanece detenida hasta completar la preparación.", false);
            Paragraph("Este paquete no incluye claves ni marcaciones. Una recepción guardada es evidencia de captura; no confirma asistencia ni liquida haberes.", true);
            SetPrimary("Comprobar este equipo", delegate { ShowPage(Page.Check); RunCheck(); });
        }

        private void CheckPage()
        {
            Eyebrow("PASO 1 · COMPROBACIÓN");
            Heading("Primero, revisamos lo que ya hay.");
            Paragraph("Esta comprobación consulta el estado local. No inicia ni detiene los relojes.");
            if (machine == null)
            {
                Card("Listo para comprobar", "Buscaremos una instalación existente y revisaremos si este equipo puede recibir el programa.", false);
                SetPrimary("Comprobar ahora", RunCheck);
            }
            else
            {
                DisplayMachineResult();
                if (machine.LegacyDetected) SetPrimary("Ver instalación existente", delegate { ShowPage(Page.Status); });
                else if (machine.Installed) SetPrimary("Ver estado", delegate { ShowPage(Page.Status); });
                else if (machine.Success) SetPrimary("Preparar mis relojes", delegate { ShowPage(Page.Configuration); LoadDraftOnce(); });
                else SetPrimary("Volver a comprobar", RunCheck);
                if (machine.Success && !machine.LegacyDetected && !machine.Installed)
                    AddLink("Instalar primero y configurar después", delegate { ShowPage(Page.Installation); });
                AddLink("Actualizar comprobación", RunCheck);
            }
        }

        private void ConfigurationPage()
        {
            Eyebrow("PASO 2 · CONFIGURACIÓN GUIADA");
            Heading("Prepará los datos de tus relojes.");
            Paragraph("Este borrador privado te ayuda a reunir la información. Guardarlo no conecta equipos, no cambia la instalación existente y no agrega credenciales.");
            if (machine != null && machine.LegacyDetected)
                Card("Tu instalación actual sigue intacta", "Los cambios de este formulario se guardan aparte. Para modificar el colector actual, seguí la guía técnica.", false);

            Label municipalityLabel = Caption("Municipio o institución");
            content.Controls.Add(municipalityLabel);
            municipality = new TextBox();
            municipality.Name = "municipalityName";
            municipality.AccessibleName = "Municipio o institución";
            municipality.MaxLength = 100;
            municipality.Height = 32;
            municipality.Text = draft == null ? "" : draft.MunicipalityName ?? "";
            Wide(municipality, 10);
            content.Controls.Add(Caption("Perfil de preparación"));
            environment = new ComboBox();
            environment.Name = "targetEnvironment";
            environment.AccessibleName = "Perfil de preparación";
            environment.DropDownStyle = ComboBoxStyle.DropDownList;
            environment.Items.Add("Instalación actual de MuniControl · Junín");
            environment.Items.Add("Otra institución · sólo borrador");
            environment.SelectedIndex = draft != null && draft.TargetEnvironment == "other-draft" ? 1 : 0;
            Wide(environment, 15);
            clocks = new DataGridView();
            clocks.Name = "clockConfiguration";
            clocks.AccessibleName = "Relojes del borrador";
            clocks.Height = 214;
            clocks.BackgroundColor = Color.White;
            clocks.BorderStyle = BorderStyle.FixedSingle;
            clocks.RowHeadersVisible = false;
            clocks.AllowUserToAddRows = false;
            clocks.AllowUserToDeleteRows = false;
            clocks.AllowUserToResizeRows = false;
            clocks.MultiSelect = false;
            clocks.SelectionMode = DataGridViewSelectionMode.CellSelect;
            clocks.AutoSizeColumnsMode = DataGridViewAutoSizeColumnsMode.Fill;
            clocks.EnableHeadersVisualStyles = false;
            clocks.ColumnHeadersDefaultCellStyle.BackColor = Pale;
            clocks.ColumnHeadersDefaultCellStyle.ForeColor = Ink;
            clocks.ColumnHeadersHeight = 39;
            clocks.RowTemplate.Height = 35;
            clocks.GridColor = Line;
            clocks.DefaultCellStyle.SelectionBackColor = Color.FromArgb(213, 237, 233);
            clocks.DefaultCellStyle.SelectionForeColor = Ink;
            AddTextColumn("Location", "Ubicación", 26, 80);
            AddTextColumn("Host", "Dirección IP", 21, 64);
            AddTextColumn("Port", "Puerto", 11, 5);
            AddTextColumn("Serial", "Número de serie", 22, 64);
            DataGridViewComboBoxColumn protocol = new DataGridViewComboBoxColumn();
            protocol.Name = "Protocol";
            protocol.HeaderText = "Protocolo";
            protocol.Items.Add("ZKTeco TCP40");
            protocol.FillWeight = 22;
            clocks.Columns.Add(protocol);
            clocks.DataError += delegate(object sender, DataGridViewDataErrorEventArgs e) { e.ThrowException = false; };
            if (draft != null && draft.Clocks != null)
                foreach (ClockDraft clock in draft.Clocks)
                    clocks.Rows.Add(clock.Location, clock.Host, clock.Port.ToString(), clock.Serial, "ZKTeco TCP40");
            Wide(clocks, 8);
            FlowLayoutPanel commands = new FlowLayoutPanel();
            commands.Height = 44;
            commands.WrapContents = false;
            Button add = SmallButton("Agregar reloj", delegate
            {
                if (clocks.Rows.Count >= 16) { Notice("Podés preparar hasta 16 relojes por colector."); return; }
                int index = clocks.Rows.Add("", "", "4370", "", "ZKTeco TCP40");
                clocks.CurrentCell = clocks.Rows[index].Cells[0];
                clocks.BeginEdit(true);
                MarkDraftChanged();
            });
            Button remove = SmallButton("Quitar fila", delegate
            {
                if (clocks.CurrentCell == null) return;
                clocks.Rows.RemoveAt(clocks.CurrentCell.RowIndex);
                MarkDraftChanged();
            });
            commands.Controls.Add(add); commands.Controls.Add(remove);
            Wide(commands, 4);
            Paragraph("Protocolo disponible: ZKTeco TCP40, puerto 4370. Otros tipos de dispositivos todavía no se pueden activar con este paquete.", true);
            draftNotice = Paragraph("Para ponerlo en marcha, un responsable técnico debe completar la configuración privada y verificar la red. No pegues claves en este formulario.", true);
            municipality.TextChanged += delegate { MarkDraftChanged(); };
            environment.SelectedIndexChanged += delegate { MarkDraftChanged(); };
            clocks.CellValueChanged += delegate { MarkDraftChanged(); };
            SetPrimary("Validar y guardar borrador", SaveDraft);
            AddLink("Cargar el borrador guardado", LoadDraft);
            AddLink("Continuar a instalación o estado", delegate { ShowPage(machine != null && (machine.Installed || machine.LegacyDetected) ? Page.Status : Page.Installation); });
            AddLink("Ver los pasos de configuración privada", ShowHelp);
        }

        private void InstallationPage()
        {
            Eyebrow("PASO 3 · INSTALACIÓN");
            Heading("Instalá el programa.\r\nLa activación viene después.");
            if (machine == null || !machine.Success || machine.LegacyDetected || machine.Installed)
            {
                if (machine != null) DisplayMachineResult();
                else Card("Comprobación pendiente", "Primero necesitamos revisar este equipo.", true);
                SetPrimary(machine != null && (machine.Installed || machine.LegacyDetected) ? "Ver estado actual" : "Comprobar este equipo",
                    delegate { if (machine != null && (machine.Installed || machine.LegacyDetected)) ShowPage(Page.Status); else { ShowPage(Page.Check); RunCheck(); } });
                return;
            }
            Paragraph("El asistente instalará MuniControl y el motor Node.js incluido en el paquete. No hace falta descargarlo ni escribir comandos.");
            Card("Incluido en la instalación", "Programa de captura, motor de ejecución, herramientas de diagnóstico y guía local.", false);
            Card("Pendiente hasta configurar", "Accesos privados, conexión con tu red, identificación de los relojes y comprobación del colector anterior.", true);
            Paragraph("Windows puede pedir autorización de administrador. Después de autorizar, el asistente vuelve a comprobar el equipo; no empieza a leer relojes automáticamente.", true);
            SetPrimary("Instalar MuniControl", Install);
        }

        private void StatusPage()
        {
            Eyebrow("PANEL DE CONTROL");
            Heading(machine != null && machine.LegacyDetected ? "Tu colector existente." : "Estado de MuniControl.");
            if (machine == null)
            {
                Card("Todavía no consultamos este equipo", "La información aparecerá después de una comprobación local.", false);
                SetPrimary("Consultar estado", RefreshStatus);
                return;
            }
            DisplayMachineResult();
            if (machine.LegacyDetected)
            {
                Paragraph("Se detectó una instalación anterior. Este asistente no crea un segundo lector ni reemplaza sus archivos o colas.");
                Card("Consultá la operación actual", "Abrí su panel para ver los estados y la recepción registrada. El estado mostrado corresponde a la última lectura disponible.", false);
                if (IsSafeLocalDocument(machine.ExistingStatusPath)) SetPrimary("Abrir estado existente", delegate { OpenDocument(machine.ExistingStatusPath); });
                else SetPrimary("Actualizar estado", RefreshStatus);
            }
            else if (!machine.Installed)
            {
                SetPrimary("Comprobar para instalar", delegate { ShowPage(Page.Check); RunCheck(); });
            }
            else if (!machine.Configured)
            {
                Card("Configuración pendiente", "El programa está instalado. Aún falta preparar y validar la configuración privada antes de activar la lectura.", true);
                SetPrimary("Preparar mis relojes", delegate { ShowPage(Page.Configuration); LoadDraftOnce(); });
            }
            else if (!machine.CanActivate)
            {
                Card("Activación no disponible", "Consultá el diagnóstico para conocer qué comprobación falta. Guardar un borrador no habilita la lectura.", true);
                SetPrimary("Consultar diagnóstico", Diagnose);
            }
            else
            {
                Card("Listo para la comprobación final", "La activación volverá a revisar la configuración y las colisiones locales. Confirmá que estos mismos relojes no se estén leyendo desde otro equipo.", true);
                stopped = new CheckBox();
                stopped.Text = "Confirmé que el colector anterior está detenido para estos relojes.";
                stopped.Name = "confirmSourceStopped";
                stopped.AutoSize = false;
                stopped.Height = 53;
                Wide(stopped, 14);
                stopped.CheckedChanged += delegate
                {
                    if (!preview) SetupBackend.ConfirmSourceStopped(stopped.Checked);
                    primary.Enabled = stopped.Checked && !busy;
                };
                SetPrimary("Activar este colector", ActivateCollector);
                primary.Enabled = false;
            }
            FlowLayoutPanel actions = new FlowLayoutPanel();
            actions.Height = 49;
            actions.WrapContents = false;
            actions.Controls.Add(SmallButton("Actualizar", RefreshStatus));
            actions.Controls.Add(SmallButton("Diagnóstico", Diagnose));
            actions.Controls.Add(SmallButton("Abrir portal", OpenPortal));
            Wide(actions, 8);
            AddLink("Configuración guiada", delegate { ShowPage(Page.Configuration); LoadDraftOnce(); });
            AddLink("Guía de instalación y conexión privada", ShowHelp);
            Paragraph("La captura y el envío deben comprobarse con una marcación real. El asistente no confirma asistencia ni modifica haberes.", true);
        }

        private void DisplayMachineResult()
        {
            string heading = machine.LegacyDetected ? "Ya existe un colector en esta PC" :
                machine.Installed ? "Programa instalado" : machine.Success ? "Comprobación terminada" : "Hay una comprobación pendiente";
            Card(heading, SafeUiText(machine.Summary, "Consultá los detalles o repetí la comprobación."), !machine.Success);
            AddDetails(machine);
        }

        private void AddDetails(BackendResult result)
        {
            if (result == null) return;
            List<string> details = result.Details ?? new List<string>();
            if (details.Count == 0 && String.IsNullOrEmpty(result.Code)) return;
            Button toggle = LinkButton("Ver detalle técnico", null);
            toggle.AutoSize = true;
            toggle.Margin = new Padding(0, 0, 0, 12);
            content.Controls.Add(toggle);
            TextBox box = new TextBox();
            box.Multiline = true;
            box.ReadOnly = true;
            box.ScrollBars = ScrollBars.Vertical;
            box.Height = 128;
            box.BackColor = Pale;
            box.BorderStyle = BorderStyle.FixedSingle;
            box.Font = new Font("Consolas", 9F);
            List<string> safe = new List<string>();
            if (!String.IsNullOrEmpty(result.Code)) safe.Add("Código: " + SafeUiText(result.Code, "SIN_CODIGO"));
            if (!String.IsNullOrEmpty(result.AppVersion)) safe.Add("Versión: " + SafeUiText(result.AppVersion, ""));
            for (int i = 0; i < details.Count && i < 30; i++) safe.Add(SafeUiText(details[i], ""));
            box.Text = String.Join(Environment.NewLine, safe.ToArray());
            Wide(box, 14);
            box.Visible = false;
            toggle.Click += delegate { box.Visible = !box.Visible; toggle.Text = box.Visible ? "Ocultar detalle técnico" : "Ver detalle técnico"; };
        }

        private void RunCheck()
        {
            Execute("Comprobando este equipo…", SetupBackend.Check, delegate(BackendResult result)
            {
                machine = result;
                ShowPage(Page.Check);
            });
        }
        private void RefreshStatus()
        {
            Execute("Consultando el estado local…", SetupBackend.GetStatus, delegate(BackendResult result)
            {
                machine = result;
                ShowPage(Page.Status);
            });
        }
        private void Diagnose()
        {
            Execute("Revisando la instalación…", SetupBackend.Diagnose, delegate(BackendResult result)
            {
                machine = result;
                ShowPage(Page.Status);
            });
        }
        private void Install()
        {
            Execute("Instalando los archivos de MuniControl…", SetupBackend.Install, delegate(BackendResult result)
            {
                machine = result;
                if (result.Code == "ADMIN_REQUIRED")
                {
                    ShowPage(Page.Installation);
                    Card("Windows necesita tu autorización", "Continuá como administrador para instalar. La nueva ventana volverá a comprobar el equipo.", true);
                    SetPrimary("Continuar como administrador", Elevate);
                }
                else ShowPage(Page.Status);
            });
        }
        private void ActivateCollector()
        {
            if (machine == null || !machine.CanActivate || stopped == null || !stopped.Checked) return;
            if (MessageBox.Show(this, "Se volverá a comprobar la configuración antes de iniciar este colector. ¿Querés continuar?",
                "Activar MuniControl", MessageBoxButtons.YesNo, MessageBoxIcon.Question) != DialogResult.Yes) return;
            Execute("Comprobando la activación…", SetupBackend.Activate, delegate(BackendResult result)
            {
                machine = result;
                ShowPage(Page.Status);
            });
        }
        private void SaveDraft()
        {
            InstallationDraft input;
            if (!TryReadDraft(out input, true)) return;
            draft = input;
            Execute("Validando y guardando el borrador privado…", delegate { return SetupBackend.SaveDraft(input); }, delegate(BackendResult result)
            {
                if (result.Success)
                {
                    draft = result.Draft ?? input;
                    configurationDirty = false;
                    configurationLoaded = true;
                    SetPrimary(machine != null && (machine.Installed || machine.LegacyDetected) ? "Ver estado actual" : "Continuar a instalación",
                        delegate { ShowPage(machine != null && (machine.Installed || machine.LegacyDetected) ? Page.Status : Page.Installation); });
                }
                if (draftNotice != null)
                {
                    draftNotice.Text = SafeUiText(result.Summary, result.Success ? "Borrador guardado. La configuración operativa sigue pendiente." : "No se pudo guardar. Tus datos siguen en el formulario.");
                    draftNotice.ForeColor = result.Success ? Teal : Color.FromArgb(135, 78, 14);
                }
                if (!result.Success) Notice(SafeUiText(result.Summary, "No se pudo guardar. Revisá los datos del formulario."));
            });
        }
        private void LoadDraftOnce() { if (!configurationLoaded && !configurationDirty) LoadDraft(); }
        private void LoadDraft()
        {
            if (configurationDirty && MessageBox.Show(this, "¿Reemplazar los cambios sin guardar por el último borrador guardado?", "Cargar borrador",
                MessageBoxButtons.YesNo, MessageBoxIcon.Question) != DialogResult.Yes) return;
            Execute("Buscando tu borrador guardado…", SetupBackend.LoadDraft, delegate(BackendResult result)
            {
                configurationLoaded = true;
                if (result.Success && result.Draft != null)
                {
                    // Prevent ShowPage from serializing the old form over the loaded draft.
                    clocks = null;
                    draft = result.Draft;
                    configurationDirty = false;
                    ShowPage(Page.Configuration);
                }
                else if (draftNotice != null) draftNotice.Text = SafeUiText(result.Summary, "Todavía no hay un borrador guardado.");
            });
        }

        private bool TryReadDraft(out InstallationDraft result, bool validate)
        {
            result = draft;
            if (clocks == null || municipality == null || environment == null) return result != null || !validate;
            clocks.EndEdit();
            result = new InstallationDraft();
            result.MunicipalityName = municipality.Text.Trim();
            result.TargetEnvironment = environment.SelectedIndex == 1 ? "other-draft" : "current";
            result.Clocks = new List<ClockDraft>();
            foreach (DataGridViewRow row in clocks.Rows)
            {
                int port;
                string portText = Cell(row, "Port");
                if (!Int32.TryParse(portText, out port))
                {
                    if (validate) Notice("Revisá el puerto del reloj en la fila " + (row.Index + 1) + ". Debe ser un número.");
                    else Notice("Corregí el puerto antes de cambiar de paso para conservar el borrador.");
                    clocks.CurrentCell = row.Cells["Port"];
                    return false;
                }
                result.Clocks.Add(new ClockDraft { Location = Cell(row, "Location"), Host = Cell(row, "Host"), Port = port,
                    Serial = Cell(row, "Serial"), Protocol = "zk40-tcp" });
            }
            if (validate && !preview)
            {
                BackendResult validation = SetupBackend.ValidateDraft(result);
                if (!validation.Success) { Notice(SafeUiText(validation.Summary, "Revisá los datos de los relojes antes de guardar.")); return false; }
            }
            return true;
        }
        private static string Cell(DataGridViewRow row, string column)
        {
            object value = row.Cells[column].Value;
            return value == null ? "" : Convert.ToString(value).Trim();
        }
        private void MarkDraftChanged()
        {
            configurationDirty = true;
            if (page == Page.Configuration) SetPrimary("Validar y guardar borrador", SaveDraft);
        }

        private async void Execute(string description, Func<BackendResult> action, Action<BackendResult> completed)
        {
            if (busy || preview) return;
            SetBusy(true, description);
            BackendResult result;
            try
            {
                result = await Task.Run(action);
                if (result == null) throw new InvalidOperationException();
            }
            catch
            {
                // Exception messages and process output may contain private local configuration.
                result = new BackendResult { Success = false, Code = "ACTION_NOT_COMPLETED",
                    Summary = "No se pudo completar la acción. Tus datos de configuración siguen en esta ventana. Consultá el estado antes de volver a intentar." };
            }
            SetBusy(false, "");
            completed(result);
        }

        private void SetBusy(bool value, string description)
        {
            busy = value;
            sidebar.Enabled = !value;
            primary.Enabled = !value;
            back.Enabled = !value;
            foreach (Control control in content.Controls) control.Enabled = !value;
            if (value)
            {
                activity.Text = description;
                content.Controls.Add(activity);
                Wide(progress, 12);
                activity.Enabled = true;
                progress.Enabled = true;
                content.ScrollControlIntoView(activity);
            }
            else
            {
                content.Controls.Remove(activity);
                content.Controls.Remove(progress);
                wideControls.Remove(progress);
            }
            UseWaitCursor = value;
        }

        private void Elevate()
        {
            if (preview) return;
            try
            {
                if (configurationDirty && MessageBox.Show(this, "Hay un borrador sin guardar. Volvé a Mis relojes y guardalo antes de abrir la ventana de administrador.",
                    "Guardá tu borrador", MessageBoxButtons.OKCancel, MessageBoxIcon.Information) == DialogResult.OK)
                { ShowPage(Page.Configuration); return; }
                if (configurationDirty) return;
                Process.Start(new ProcessStartInfo { FileName = Application.ExecutablePath, UseShellExecute = true, Verb = "runas", WorkingDirectory = AppDomain.CurrentDomain.BaseDirectory });
                Close();
            }
            catch { Notice("Windows no autorizó la nueva ventana. Podés seguir consultando el estado o volver a intentarlo."); }
        }
        private void OpenPortal()
        {
            if (preview) return;
            try { Process.Start(new ProcessStartInfo { FileName = Portal, UseShellExecute = true }); }
            catch { Notice("No se pudo abrir el navegador. Podés ingresar al portal de MuniControl desde tu navegador habitual."); }
        }
        private void OpenDocument(string path)
        {
            if (preview) return;
            if (!IsSafeLocalDocument(path)) { Notice("La guía o el panel local todavía no está disponible. Consultá el diagnóstico."); return; }
            try { Process.Start(new ProcessStartInfo { FileName = Path.GetFullPath(path), UseShellExecute = true }); }
            catch { Notice("No se pudo abrir el documento local. Revisá si hay un navegador disponible en este equipo."); }
        }
        private void ShowHelp()
        {
            if (machine != null && IsSafeLocalDocument(machine.GuidePath)) { OpenDocument(machine.GuidePath); return; }
            using (Form help = new Form())
            {
                help.Text = "Cómo usar MuniControl";
                help.StartPosition = FormStartPosition.CenterParent;
                help.ClientSize = new Size(640, 505);
                help.MinimumSize = new Size(610, 430);
                help.Font = Font;
                help.BackColor = Color.White;
                TextBox text = new TextBox();
                text.Multiline = true; text.ReadOnly = true; text.ScrollBars = ScrollBars.Vertical;
                text.Dock = DockStyle.Fill; text.BorderStyle = BorderStyle.None;
                text.BackColor = Color.White; text.ForeColor = Ink;
                text.Text = "1. Comprobá este equipo\r\nSi MuniControl ya está leyendo relojes, abrí su estado. No instales un segundo colector.\r\n\r\n" +
                    "2. Prepará Mis relojes\r\nCargá institución, ubicación, IP, puerto y serie. Sólo ZKTeco TCP40 está disponible. El borrador se guarda separado de la configuración operativa; nunca pegues claves.\r\n\r\n" +
                    "3. Instalá el programa\r\nEl paquete incluye el motor Node.js. Windows puede pedir autorización. Instalar no inicia tareas ni modifica el colector existente.\r\n\r\n" +
                    "4. Completá la configuración privada\r\nUn responsable técnico debe preparar los accesos y la identidad de cada reloj, validar la red y el destino autorizado. En esta versión ese paso requiere la guía técnica; el formulario no lo reemplaza.\r\n\r\n" +
                    "5. Activá sólo cuando corresponda\r\nEl origen debe estar detenido y la configuración validada. Después comprobá una marcación real, su recepción guardada y la consulta en el portal.\r\n\r\n" +
                    "Guardar una captura no confirma asistencia ni liquida haberes. Este instalador no configura Oracle ni otra nube.";
                Panel padded = new Panel(); padded.Padding = new Padding(25); padded.Dock = DockStyle.Fill; padded.Controls.Add(text);
                help.Controls.Add(padded);
                help.ShowDialog(this);
            }
        }

        private void SetPrimary(string text, Action action) { primary.Text = text; primaryAction = action; primary.Enabled = true; }
        private void Notice(string message) { if (!preview) MessageBox.Show(this, message, "MuniControl", MessageBoxButtons.OK, MessageBoxIcon.Information); }
        private void AddTextColumn(string name, string title, float weight, int maxLength)
        {
            DataGridViewTextBoxColumn column = new DataGridViewTextBoxColumn();
            column.Name = name; column.HeaderText = title; column.FillWeight = weight; column.MaxInputLength = maxLength;
            clocks.Columns.Add(column);
        }
        private void FitContent()
        {
            int width = Math.Max(440, content.ClientSize.Width - content.Padding.Horizontal - SystemInformation.VerticalScrollBarWidth - 4);
            foreach (Control control in wideControls)
            {
                if (control.IsDisposed) continue;
                if (control is Label) ((Label)control).MaximumSize = new Size(width, 0);
                else control.Width = width;
            }
            primary.Left = footer.ClientSize.Width - primary.Width - 30;
        }
        private void Wide(Control control, int bottom)
        {
            control.Margin = new Padding(0, 0, 0, bottom);
            wideControls.Add(control); content.Controls.Add(control); FitContent();
        }
        private Label Paragraph(string text) { return Paragraph(text, false); }
        private Label Paragraph(string text, bool small)
        {
            Label label = new Label();
            label.Text = text; label.AutoSize = true;
            label.Font = new Font("Segoe UI", small ? 9F : 11F);
            label.ForeColor = Muted;
            Wide(label, small ? 14 : 23);
            return label;
        }
        private void Heading(string text)
        {
            Label title = new Label(); title.Text = text; title.AutoSize = true;
            title.Font = new Font("Segoe UI", 25F, FontStyle.Bold); title.ForeColor = Ink;
            Wide(title, 17);
        }
        private void Eyebrow(string text)
        {
            Label label = new Label(); label.Text = text; label.AutoSize = true;
            label.ForeColor = Teal; label.Font = new Font("Segoe UI", 9F, FontStyle.Bold);
            Wide(label, 13);
        }
        private Label Caption(string text)
        {
            Label label = new Label(); label.Text = text; label.AutoSize = true;
            label.Font = new Font("Segoe UI", 10F, FontStyle.Bold); label.Margin = new Padding(0, 0, 0, 5);
            return label;
        }
        private void Card(string title, string message, bool attention)
        {
            Panel panel = new Panel(); panel.Height = 100;
            panel.BackColor = attention ? Color.FromArgb(255, 248, 230) : Pale;
            Label heading = new Label(); heading.Text = title; heading.Font = new Font("Segoe UI", 11F, FontStyle.Bold);
            heading.Location = new Point(18, 14); heading.Size = new Size(620, 25);
            heading.Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right;
            panel.Controls.Add(heading);
            Label body = new Label(); body.Text = message; body.Font = new Font("Segoe UI", 10F);
            body.ForeColor = Muted; body.Location = new Point(18, 43); body.Size = new Size(620, 48);
            body.Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right;
            panel.Controls.Add(body);
            panel.Resize += delegate
            {
                heading.Width = panel.Width - 36; body.Width = panel.Width - 36;
                int titleHeight = TextRenderer.MeasureText(title, heading.Font, new Size(heading.Width, 0), TextFormatFlags.WordBreak).Height;
                heading.Height = Math.Max(25, titleHeight); body.Top = heading.Bottom + 4;
                int bodyHeight = TextRenderer.MeasureText(message, body.Font, new Size(body.Width, 0), TextFormatFlags.WordBreak).Height;
                body.Height = Math.Max(38, bodyHeight + 4); panel.Height = body.Bottom + 13;
            };
            Wide(panel, 12);
        }
        private void AddLink(string text, Action action)
        {
            Button button = LinkButton(text, action); button.AutoSize = true;
            button.Margin = new Padding(0, 0, 0, 9); content.Controls.Add(button);
        }
        private Button SmallButton(string text, Action action)
        {
            Button button = new Button(); StyleButton(button, false);
            button.Text = text; button.AutoSize = true; button.Height = 37;
            button.MinimumSize = new Size(120, 37); button.Margin = new Padding(0, 0, 9, 0);
            button.Click += delegate { if (!busy) action(); }; return button;
        }
        private Button LinkButton(string text, Action action)
        {
            Button button = new Button(); button.Text = text;
            button.FlatStyle = FlatStyle.Flat; button.FlatAppearance.BorderSize = 0;
            button.ForeColor = Teal; button.BackColor = Color.Transparent;
            button.TextAlign = ContentAlignment.MiddleLeft; button.Padding = new Padding(0);
            button.Cursor = Cursors.Hand; button.Height = 34;
            if (action != null) button.Click += delegate { if (!busy) action(); };
            return button;
        }
        private static void StyleButton(Button button, bool prominent)
        {
            button.FlatStyle = FlatStyle.Flat; button.FlatAppearance.BorderSize = prominent ? 0 : 1;
            button.FlatAppearance.BorderColor = Line;
            button.BackColor = prominent ? Teal : Color.White;
            button.ForeColor = prominent ? Color.White : Ink;
            button.Font = new Font("Segoe UI", 10F, prominent ? FontStyle.Bold : FontStyle.Regular);
            button.Cursor = Cursors.Hand; button.UseVisualStyleBackColor = false;
        }
        private static string SafeUiText(string text, string fallback)
        {
            if (String.IsNullOrWhiteSpace(text)) return fallback;
            // Only backend-authored summaries belong here; raw exceptions are never forwarded.
            return text.Length > 1500 ? text.Substring(0, 1500) : text;
        }
        private static bool IsSafeLocalDocument(string path)
        {
            if (String.IsNullOrWhiteSpace(path) || !Path.IsPathRooted(path) || path.StartsWith(@"\\", StringComparison.Ordinal)) return false;
            try
            {
                string extension = Path.GetExtension(path).ToLowerInvariant();
                return (extension == ".html" || extension == ".htm") && File.Exists(path) &&
                    (File.GetAttributes(path) & FileAttributes.ReparsePoint) == 0;
            }
            catch { return false; }
        }

        internal static bool SelfTest()
        {
            // Pure guards only. No installed paths, network, UAC, forms, writes or device calls.
            return SafeUiText(null, "pending") == "pending" && SafeUiText(new string('a', 2000), "").Length == 1500 &&
                !IsSafeLocalDocument("https://example.invalid/help.html") && !IsSafeLocalDocument(@"\\host\guide.html") &&
                !IsSafeLocalDocument("guide.html") && !IsSafeLocalDocument(@"C:\not-executed.exe");
        }
        internal void PreparePreview(string target)
        {
            if (!preview) throw new InvalidOperationException();
            if (target == "configuration")
            {
                draft = new InstallationDraft { MunicipalityName = "Institución de ejemplo", TargetEnvironment = "other-draft", Clocks = new List<ClockDraft>() };
                draft.Clocks.Add(new ClockDraft { Location = "Recepción · ejemplo", Host = "192.0.2.10", Port = 4370, Serial = "EJEMPLO-01", Protocol = "zk40-tcp" });
                ShowPage(Page.Configuration);
            }
            else if (target == "status" || target == "existing")
            {
                machine = new BackendResult { Success = true, Installed = target == "status", LegacyDetected = target == "existing",
                    Configured = false, CanActivate = false, Code = "OFFLINE_PREVIEW", Summary = "Vista de ejemplo para revisar el diseño. No se consultó ni modificó esta PC.", Details = new List<string>() };
                ShowPage(Page.Status);
            }
            else ShowPage(Page.Welcome);
        }
        internal void PreparePreviewHandles()
        {
            if (!preview) throw new InvalidOperationException();
            // WinForms grids and combo boxes do not paint their text until Visible is true.
            // This synthetic QA window stays transparent, off-screen and out of the taskbar.
            // No backend is called, no focus is requested and the caller disposes it immediately.
            ShowInTaskbar = false;
            StartPosition = FormStartPosition.Manual;
            Location = new Point(-20000, -20000);
            Opacity = 0;
            Show();
            CreatePreviewHandle(this);
            PerformLayout();
            FitContent();
            CreatePreviewHandle(this);
            Application.DoEvents();
        }
        protected override bool ShowWithoutActivation { get { return preview || base.ShowWithoutActivation; } }
        private static void CreatePreviewHandle(Control control)
        {
            // Force child handles and layout for off-screen DrawToBitmap; no message loop is run.
            IntPtr handle = control.Handle;
            foreach (Control child in control.Controls) CreatePreviewHandle(child);
            control.PerformLayout();
        }
        protected override void Dispose(bool disposing)
        {
            if (disposing) { hints.Dispose(); activity.Dispose(); progress.Dispose(); }
            base.Dispose(disposing);
        }
    }
}
