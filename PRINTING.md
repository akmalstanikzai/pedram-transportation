# Receipt printing on Windows and Android

Every existing print action opens the same preview. Select **80 mm receipt**, **58 mm receipt**, or **A4 / PDF**, then **Print / Save PDF**. The browser remembers the paper choice on that device. All authorized report rows are retained. Receipt sections use compact bordered tables with related information side by side and a separator between sections. Cashbook period summaries use four columns at 80 mm and two at 58 mm. Wider records use consecutive small tables so fields remain readable. Browser/PDF and Android image exports share the same table layout. Every print includes the small centered footer `rayan-tech-solution.tech`.

On Android with Cleanter installed, use **Print receipt (Cleanter)** for continuous receipt printing without Android's fixed roll-page length. If the preview was set to A4/PDF, this button automatically selects 80 mm rather than staying disabled. The button shows Connecting/Printing while it works. **Print / Save PDF** remains available for the normal system dialog and PDF export.

Covered: booking confirmations, Cashbook period statements, individual Cashbook receipts, employee and driver statements, President-side trader statements, Trader portal My account, and employee payroll payslips. The Cashbook period printout still omits the receipt-number column.

## Printer identified from the supplied photos

The sticker reads **POS-HQ300**, USB + Bluetooth, 5 V / 1 A. The self-test identifies Bluetooth **HLabel_A862**, PIN **0000**, and **Receipt Mode**. Manufacturer identity and the exact driver cannot be conclusively established from these photos. HOIN's related HOP-HQ300 is an 80 mm dual receipt/label model; verify the matching driver with your printer seller before installing it. Measure the installed roll if unsure of its width.

Use continuous thermal receipt paper and Receipt/ESC-POS mode, not gap-label mode. The supplied self-test is already in Receipt Mode. Do not change its code page to try to print Dari: use the browser/driver's graphical print path or the receipt PNG images instead.

## Windows computer (recommended: USB)

1. Charge or power the printer, load the thermal roll, and connect a USB **data** cable.
2. Install the Windows receipt driver supplied by the seller for this exact model. If the seller confirms it is the HOIN model, use HOIN's official downloads, not an unrelated driver site.
3. Open Windows **Settings → Bluetooth & devices → Printers & scanners**. Verify the printer is installed and print its Windows test page. A Bluetooth pairing alone does not install a usable Windows printer driver; use USB first.
4. In Printing preferences, select the installed receipt width (normally 80 mm), portrait orientation and Receipt/continuous paper mode. Disable cutting if your model has no cutter.
5. In Pedram, open any print action, choose **80 mm receipt**, then **Print / Save PDF**. Select the installed printer, use 100% scale, and disable browser headers/footers. Use the driver's matching receipt paper size and minimum/no additional driver margins. The document already has safe side margins.
6. Print one individual Cashbook receipt first. If the edges clip, check the driver paper width and scale; if your roll is actually 58 mm, select 58 mm in both places. If the printer feeds a long blank tail, use the driver’s continuous/receipt setting or a paper length close to the receipt rather than A4.

## Android phone (Bluetooth)

### Cleanter: compact continuous receipts (recommended)

1. Pair **HiLabel_A862** in Android Bluetooth settings (PIN **0000** if requested). Disconnect another computer/phone that is using the printer.
2. Open **Cleanter: Thermal Printer BT**, select the paired printer, choose 80 mm, and start its local service if it is not already running.
3. In Pedram's report preview choose **80 mm receipt → Print receipt (Cleanter)**. If Chrome asks to access other apps/services on this device, allow it. If access was previously blocked, open this site's Chrome permissions and enable **Apps on device**.
4. This button sends the locally generated receipt images to Cleanter on `http://localhost:9100` as one continuous print job. The compact table layout, Dari text and company credit are included in the images. There are no PDF page breaks or page-length blank areas between image parts, and only one blank feed line is requested at the end. Paper advance added by the printer/app is still controlled there.
5. If Chrome has blocked device access, the preview shows a permission-specific instruction without sending a job. If printing is not confirmed after sending, inspect the printer and Cleanter's job history before trying again. Pedram does not automatically resend an uncertain job or fall back to a second print path, preventing accidental duplicate receipts. **Print / Save PDF** and **Prepare receipt images** remain available.

The bridge is contacted only after a user taps the Cleanter button. No background printer discovery or cloud conversion is used. The phone and Cleanter must be the same device. A4 printing uses the ordinary print/PDF path.

### RawBT alternative

1. Turn the printer on. In Android Bluetooth settings, pair **HLabel_A862**. If requested, enter **0000** as printed on your own test slip. Disconnect another phone/computer if the printer is already connected elsewhere.
2. Install **RawBT inkless print service** from Google Play. Allow the nearby-device permissions it requests. Select the paired printer and 80 mm / approximately 576-dot printing width if those settings are offered. In receipt mode, try the default ESC/POS graphics command (GS v 0) first and run RawBT's test print. Exact support must be checked on your unit.
3. In Android Settings, search for **Printing** and enable RawBT as a print service if your version exposes it there. Open Pedram in Chrome, open the report preview, select **80 mm receipt**, and tap **Print / Save PDF**. Choose RawBT/the configured printer from Android's print destinations. If the button does not open Android printing on your browser version, use Chrome's **More → Share → Print** menu on the preview, or use the image method below.
4. If the printer does not appear in Chrome's destination list, return to the Pedram preview and tap **Prepare receipt images**. Download each numbered PNG, open it from Downloads or Gallery, and use **Share/Open with → RawBT**. Print all parts in order. Alternatively, save a PDF and open/share it with RawBT. Do not send a private report URL to a third-party web printing service.
5. Keep the image at the printer’s full printable width with its proportions preserved. Use the app's image/graphics mode so Dari letters are rendered as pictured. If output is blank, check the thermal side of the roll; if it is garbled, check Receipt/ESC-POS mode and the app's graphics command.

Bluetooth pairing by itself does not make a printer appear in a browser. The Android print service/app provides that connection. Pedram does not silently pair with printers or upload documents to an external conversion server. Images are generated locally in the report window; they contain the same role-scoped report data. Keep exported financial documents and ID-related information on authorized devices.

## Paper and text

- Default 80 mm paper uses 72 mm of content width; 58 mm uses 50 mm. The receipt includes 2 mm top/bottom and 4 mm side padding, with no additional CSS page margins. On desktop, short print pages are measured at their physical print width after fonts/logo load and again for native printing; long browser statements paginate at up to 1,000 mm per page. On Android the normal print path uses `@page size: auto` and the receipt paper selected in the system print dialog, so Chrome does not vertically center a shorter CSS page inside a longer service sheet. The closing note and credit stay together. Driver/service paper length can still add trailing paper; the Cleanter button bypasses sheet pagination entirely.
- Receipt PNGs are black on white, 576 pixels wide for 80 mm or 384 pixels for 58 mm. Long exports are split into parts up to 6,000 pixels high to avoid oversized Android images. Download every part.
- Dari uses the bundled Vazirmatn font, RTL layout and image rendering, not raw ESC/POS text encoding. The image output contains the company name and report text; the browser/PDF output also includes the company logo.
- A4 remains available for regular office printers and large PDF reports. Browsers/printer drivers retain control over the final destination and settings.
- A successful preview or image export does not prove a physical printer is connected. Run the app/driver test and one Pedram test receipt before printing long statements.

## References

- HOIN HQ300 guide: https://www.hoinprinter.com/hop-hq300.html
- HOIN official drivers: https://www.hoinprinter.com/download.html
- Cleanter: https://play.google.com/store/apps/details?id=id.cleancode.cleanter
- Cleanter local image-print API: https://cleanter.cleancode.id/docs/api-reference
- Cleanter Chrome permission guidance: https://cleanter.cleancode.id/docs/troubleshooting
- RawBT developer's Google Play listing: https://play.google.com/store/apps/details?id=ru.a402d.rawbtprinter
- Chrome Web Bluetooth documentation (BLE/GATT, not a generic receipt-printing driver): https://developer.chrome.com/docs/capabilities/bluetooth
- Google's Android Chrome print instructions: https://support.google.com/chrome/answer/1069693?co=GENIE.Platform%3DAndroid&hl=en

No database migration or Edge Function redeployment is required for this change. Publish the updated frontend. Physical printing and the seller's exact POS-HQ300 driver must be verified with your connected hardware.
