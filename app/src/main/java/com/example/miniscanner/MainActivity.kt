package com.example.miniscanner

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.pdf.PdfRenderer
import android.net.Uri
import android.os.Bundle
import android.os.ParcelFileDescriptor
import android.util.Xml
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.result.IntentSenderRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.google.mlkit.vision.documentscanner.GmsDocumentScannerOptions
import com.google.mlkit.vision.documentscanner.GmsDocumentScannerOptions.RESULT_FORMAT_JPEG
import com.google.mlkit.vision.documentscanner.GmsDocumentScannerOptions.RESULT_FORMAT_PDF
import com.google.mlkit.vision.documentscanner.GmsDocumentScannerOptions.SCANNER_MODE_FULL
import com.google.mlkit.vision.documentscanner.GmsDocumentScanning
import com.google.mlkit.vision.documentscanner.GmsDocumentScanningResult
import org.xmlpull.v1.XmlPullParser
import java.io.File
import java.io.FileOutputStream
import java.io.InputStream
import java.util.zip.ZipInputStream

sealed class Screen {
    object Main : Screen()
    data class PdfView(val uri: Uri) : Screen()
    data class ExcelView(val uri: Uri) : Screen()
}

class MainActivity : ComponentActivity() {

    private var currentScreen by mutableStateOf<Screen>(Screen.Main)
    private var scannedPdfUri by mutableStateOf<Uri?>(null)
    private var scannedPageCount by mutableStateOf(0)

    private val scannerLauncher = registerForActivityResult(
        ActivityResultContracts.StartIntentSenderForResult()
    ) { result ->
        if (result.resultCode == Activity.RESULT_OK) {
            val scanResult = GmsDocumentScanningResult.fromActivityResultIntent(result.data)
            scanResult?.let {
                scannedPageCount = it.pages?.size ?: 0
                scannedPdfUri = it.pdf?.uri
                Toast.makeText(this, "Quét tài liệu thành công!", Toast.LENGTH_SHORT).show()
            }
        } else if (result.resultCode == Activity.RESULT_CANCELED) {
            Toast.makeText(this, "Hủy quét", Toast.LENGTH_SHORT).show()
        } else {
            Toast.makeText(this, "Quét thất bại", Toast.LENGTH_SHORT).show()
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val options = GmsDocumentScannerOptions.Builder()
            .setScannerMode(SCANNER_MODE_FULL)
            .setGalleryImportAllowed(true)
            .setResultFormats(RESULT_FORMAT_PDF, RESULT_FORMAT_JPEG)
            .build()
        val scanner = GmsDocumentScanning.getClient(options)

        setContent {
            MaterialTheme(
                colorScheme = darkColorScheme(
                    primary = Color(0xFF64B5F6),
                    background = Color(0xFF121212),
                    surface = Color(0xFF1E1E1E)
                )
            ) {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = MaterialTheme.colorScheme.background
                ) {
                    when (val screen = currentScreen) {
                        is Screen.Main -> MainScreen(
                            scanner = scanner,
                            onOpenPdf = { currentScreen = Screen.PdfView(it) },
                            onOpenExcel = { currentScreen = Screen.ExcelView(it) }
                        )
                        is Screen.PdfView -> PdfViewerScreen(
                            uri = screen.uri,
                            onBack = { currentScreen = Screen.Main }
                        )
                        is Screen.ExcelView -> ExcelViewerScreen(
                            uri = screen.uri,
                            onBack = { currentScreen = Screen.Main }
                        )
                    }
                }
            }
        }
    }

    @Composable
    fun MainScreen(
        scanner: com.google.mlkit.vision.documentscanner.GmsDocumentScanner,
        onOpenPdf: (Uri) -> Unit,
        onOpenExcel: (Uri) -> Unit
    ) {
        val pdfPickerLauncher = rememberLauncherForActivityResult(
            contract = ActivityResultContracts.GetContent()
        ) { uri: Uri? ->
            uri?.let { onOpenPdf(it) }
        }

        val excelPickerLauncher = rememberLauncherForActivityResult(
            contract = ActivityResultContracts.GetContent()
        ) { uri: Uri? ->
            uri?.let { onOpenExcel(it) }
        }

        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(24.dp),
            verticalArrangement = Arrangement.Center,
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Text(
                text = "Mini Doc & Scanner",
                style = MaterialTheme.typography.headlineLarge,
                color = MaterialTheme.colorScheme.primary,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.padding(bottom = 8.dp)
            )

            Text(
                text = "Tối giản • Siêu nhẹ • Không quảng cáo",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.6f),
                modifier = Modifier.padding(bottom = 48.dp)
            )

            Button(
                onClick = {
                    scanner.getStartScanIntent(this@MainActivity)
                        .addOnSuccessListener { intentSender ->
                            scannerLauncher.launch(
                                IntentSenderRequest.Builder(intentSender).build()
                            )
                        }
                        .addOnFailureListener { e ->
                            Toast.makeText(this@MainActivity, "Lỗi: ${e.message}", Toast.LENGTH_LONG).show()
                        }
                },
                modifier = Modifier
                    .fillMaxWidth()
                    .height(56.dp)
            ) {
                Text("Quét tài liệu bằng Camera", style = MaterialTheme.typography.titleMedium)
            }

            Spacer(modifier = Modifier.height(16.dp))

            OutlinedButton(
                onClick = { pdfPickerLauncher.launch("application/pdf") },
                modifier = Modifier
                    .fillMaxWidth()
                    .height(56.dp)
            ) {
                Text("Mở File PDF", style = MaterialTheme.typography.titleMedium)
            }

            Spacer(modifier = Modifier.height(16.dp))

            OutlinedButton(
                onClick = { excelPickerLauncher.launch("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet") },
                modifier = Modifier
                    .fillMaxWidth()
                    .height(56.dp)
            ) {
                Text("Mở File Excel (.xlsx)", style = MaterialTheme.typography.titleMedium)
            }

            scannedPdfUri?.let { uri ->
                Spacer(modifier = Modifier.height(32.dp))
                Card(
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Column(
                        modifier = Modifier.padding(16.dp),
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {
                        Text(text = "Tài liệu vừa quét: $scannedPageCount trang", style = MaterialTheme.typography.bodyLarge)
                        Spacer(modifier = Modifier.height(16.dp))
                        Row(
                            horizontalArrangement = Arrangement.SpaceEvenly,
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Button(onClick = { onOpenPdf(uri) }) {
                                Text("Xem PDF")
                            }
                            OutlinedButton(onClick = { sharePdf(uri) }) {
                                Text("Chia sẻ")
                            }
                        }
                    }
                }
            }
        }
    }

    @Composable
    fun PdfViewerScreen(uri: Uri, onBack: () -> Unit) {
        var pdfBitmaps by remember { mutableStateOf<List<Bitmap>>(emptyList()) }
        var errorMessage by remember { mutableStateOf<String?>(null) }

        LaunchedEffect(uri) {
            try {
                pdfBitmaps = renderPdfPages(this@MainActivity, uri)
            } catch (e: Exception) {
                errorMessage = "Không thể đọc PDF: ${e.message}"
            }
        }

        Column(modifier = Modifier.fillMaxSize()) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(8.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                TextButton(onClick = onBack) {
                    Text("← Quay lại", style = MaterialTheme.typography.titleMedium)
                }
                Spacer(modifier = Modifier.width(8.dp))
                Text(
                    text = "Đang đọc PDF",
                    style = MaterialTheme.typography.titleLarge,
                    color = MaterialTheme.colorScheme.primary
                )
            }

            if (errorMessage != null) {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Text(text = errorMessage!!, color = MaterialTheme.colorScheme.error)
                }
            } else {
                LazyColumn(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(horizontal = 8.dp)
                ) {
                    items(pdfBitmaps) { bitmap ->
                        Card(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(vertical = 8.dp),
                            elevation = CardDefaults.cardElevation(defaultElevation = 4.dp)
                        ) {
                            Image(
                                bitmap = bitmap.asImageBitmap(),
                                contentDescription = "PDF Page",
                                modifier = Modifier.fillMaxWidth(),
                                contentScale = ContentScale.FillWidth
                            )
                        }
                    }
                }
            }
        }
    }

    @Composable
    fun ExcelViewerScreen(uri: Uri, onBack: () -> Unit) {
        var excelData by remember { mutableStateOf<List<List<String>>>(emptyList()) }
        var errorMessage by remember { mutableStateOf<String?>(null) }
        var isLoading by remember { mutableStateOf(true) }

        LaunchedEffect(uri) {
            try {
                excelData = parseXlsx(this@MainActivity, uri)
                isLoading = false
            } catch (e: Exception) {
                errorMessage = "Lỗi đọc file Excel: ${e.message}"
                isLoading = false
            }
        }

        Column(modifier = Modifier.fillMaxSize()) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(8.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                TextButton(onClick = onBack) {
                    Text("← Quay lại", style = MaterialTheme.typography.titleMedium)
                }
                Spacer(modifier = Modifier.width(8.dp))
                Text(
                    text = "Đang đọc Excel",
                    style = MaterialTheme.typography.titleLarge,
                    color = MaterialTheme.colorScheme.primary
                )
            }

            if (isLoading) {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator()
                }
            } else if (errorMessage != null) {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Text(text = errorMessage!!, color = MaterialTheme.colorScheme.error)
                }
            } else {
                val horizontalScrollState = rememberScrollState()

                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .horizontalScroll(horizontalScrollState)
                ) {
                    LazyColumn(
                        modifier = Modifier.padding(16.dp)
                    ) {
                        items(excelData) { row ->
                            Row {
                                row.forEach { cellText ->
                                    Box(
                                        modifier = Modifier
                                            .width(120.dp)
                                            .padding(2.dp)
                                            .background(MaterialTheme.colorScheme.surface)
                                            .padding(8.dp)
                                    ) {
                                        Text(
                                            text = cellText,
                                            style = MaterialTheme.typography.bodyMedium,
                                            color = MaterialTheme.colorScheme.onSurface
                                        )
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    private fun renderPdfPages(context: Context, uri: Uri): List<Bitmap> {
        val bitmaps = mutableListOf<Bitmap>()
        val tempFile = File(context.cacheDir, "temp_view.pdf")
        context.contentResolver.openInputStream(uri)?.use { input ->
            FileOutputStream(tempFile).use { output ->
                input.copyTo(output)
            }
        }

        val parcelFileDescriptor = ParcelFileDescriptor.open(tempFile, ParcelFileDescriptor.MODE_READ_ONLY)
        val renderer = PdfRenderer(parcelFileDescriptor)

        for (i in 0 until renderer.pageCount) {
            val page = renderer.openPage(i)
            val width = 1080
            val height = (width * page.height) / page.width
            val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
            page.render(bitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
            bitmaps.add(bitmap)
            page.close()
        }
        renderer.close()
        parcelFileDescriptor.close()
        tempFile.delete()

        return bitmaps
    }

    private fun parseXlsx(context: Context, uri: Uri): List<List<String>> {
        val sharedStrings = mutableListOf<String>()
        context.contentResolver.openInputStream(uri)?.use { input ->
            val zip = ZipInputStream(input)
            var entry = zip.nextEntry
            while (entry != null) {
                if (entry.name == "xl/sharedStrings.xml") {
                    sharedStrings.addAll(parseSharedStrings(zip))
                }
                entry = zip.nextEntry
            }
        }

        val rows = mutableListOf<List<String>>()
        context.contentResolver.openInputStream(uri)?.use { input ->
            val zip = ZipInputStream(input)
            var entry = zip.nextEntry
            while (entry != null) {
                if (entry.name == "xl/worksheets/sheet1.xml") {
                    rows.addAll(parseSheet(zip, sharedStrings))
                    break
                }
                entry = zip.nextEntry
            }
        }
        return rows
    }

    private fun parseSharedStrings(inputStream: InputStream): List<String> {
        val list = mutableListOf<String>()
        val parser = Xml.newPullParser()
        parser.setInput(inputStream, "UTF-8")
        var eventType = parser.eventType
        var currentText = ""
        var insideT = false

        while (eventType != XmlPullParser.END_DOCUMENT) {
            val name = parser.name
            when (eventType) {
                XmlPullParser.START_TAG -> {
                    if (name == "t") insideT = true
                }
                XmlPullParser.TEXT -> {
                    if (insideT) currentText = parser.text
                }
                XmlPullParser.END_TAG -> {
                    if (name == "t") {
                        list.add(currentText)
                        insideT = false
                        currentText = ""
                    }
                }
            }
            eventType = parser.next()
        }
        return list
    }

    private fun parseSheet(inputStream: InputStream, sharedStrings: List<String>): List<List<String>> {
        val rows = mutableListOf<List<String>>()
        val parser = Xml.newPullParser()
        parser.setInput(inputStream, "UTF-8")
        var eventType = parser.eventType

        var currentRow = mutableListOf<String>()
        var isSharedString = false
        var currentCellText = ""
        var insideValue = false

        while (eventType != XmlPullParser.END_DOCUMENT) {
            val name = parser.name
            when (eventType) {
                XmlPullParser.START_TAG -> {
                    if (name == "row") {
                        currentRow = mutableListOf()
                    } else if (name == "c") {
                        val typeAttr = parser.getAttributeValue(null, "t")
                        isSharedString = typeAttr == "s"
                    } else if (name == "v") {
                        insideValue = true
                    }
                }
                XmlPullParser.TEXT -> {
                    if (insideValue) {
                        val rawVal = parser.text
                        currentCellText = if (isSharedString) {
                            val idx = rawVal.toIntOrNull()
                            if (idx != null && idx >= 0 && idx < sharedStrings.size) {
                                sharedStrings[idx]
                            } else {
                                rawVal
                            }
                        } else {
                            rawVal
                        }
                    }
                }
                XmlPullParser.END_TAG -> {
                    if (name == "v") {
                        insideValue = false
                    } else if (name == "c") {
                        currentRow.add(currentCellText)
                        currentCellText = ""
                        isSharedString = false
                    } else if (name == "row") {
                        rows.add(currentRow)
                    }
                }
            }
            eventType = parser.next()
        }
        return rows
    }

    private fun sharePdf(uri: Uri) {
        try {
            val intent = Intent(Intent.ACTION_SEND).apply {
                type = "application/pdf"
                putExtra(Intent.EXTRA_STREAM, uri)
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }
            startActivity(Intent.createChooser(intent, "Chia sẻ tài liệu"))
        } catch (e: Exception) {
            Toast.makeText(this, "Không thể chia sẻ file", Toast.LENGTH_SHORT).show()
        }
    }
}
