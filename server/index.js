import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { appendFileSync } from 'fs';
import { readFile } from 'fs/promises';
import jsPDF from 'jspdf';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Helper function to apply recency weights to HFI scores
function applyRecencyWeights(lead) {
  const recent = lead.recency_data["0_30_days"] || 0;
  const supporting = lead.recency_data["31_90_days"] || 0;
  const historical = lead.recency_data["90_plus_days"] || 0;
  
  // Calculate weighted score (0-30 days: 1.0x, 31-90 days: 0.5x, 90+ days: 0.0x)
  const weightedIssues = (recent * 1.0) + (supporting * 0.5) + (historical * 0.0);
  
  return {
    ...lead,
    weighted_issues: weightedIssues,
    recency_score: recent / (recent + supporting + historical) || 0
  };
}

// API Routes
app.get('/api/leads', async (req, res) => {
  try {
    const mockDataPath = join(__dirname, '..', '_architect_ref', 'MOCK_DATA.json');
    const rawData = await readFile(mockDataPath, 'utf-8');
    const data = JSON.parse(rawData);
    
    // Apply recency weighting to all leads
    const processedLeads = data.leads.map(applyRecencyWeights);
    
    res.json({
      leads: processedLeads,
      metadata: data.metadata
    });
  } catch (error) {
    console.error('Error loading mock data:', error);
    res.status(500).json({ 
      error: 'Failed to load leads data',
      message: error.message 
    });
  }
});

// Get single lead by ID
app.get('/api/leads/:id', async (req, res) => {
  try {
    const mockDataPath = join(__dirname, '..', '_architect_ref', 'MOCK_DATA.json');
    const rawData = await readFile(mockDataPath, 'utf-8');
    const data = JSON.parse(rawData);
    
    const lead = data.leads.find(l => l.id === req.params.id);
    
    if (!lead) {
      return res.status(404).json({ error: 'Lead not found' });
    }
    
    res.json(applyRecencyWeights(lead));
  } catch (error) {
    console.error('Error loading lead:', error);
    res.status(500).json({ 
      error: 'Failed to load lead data',
      message: error.message 
    });
  }
});

// Helper function to generate Staff Pitch Hook
function generateStaffPitchHook(lead) {
  const recent = lead.recency_data["0_30_days"] || 0;
  const supporting = lead.recency_data["31_90_days"] || 0;
  const primaryCluster = lead.friction_clusters[0];
  const topQuote = primaryCluster?.sample_quotes[0] || '';
  
  return `**Staff Pitch Hook**

${lead.business_name} is experiencing a ${recent}% spike in ${lead.friction_type.toLowerCase()} complaints in the last 30 days, with ${supporting} supporting issues from the previous 60 days. This represents a clear technical friction point that our alumni network can address.

**Key Customer Voice:**
"${topQuote}"

**Impact:** ${lead.time_on_task_estimate}`;
}

// Helper function to generate Efficiency Table
function generateEfficiencyTable(lead) {
  const primaryCluster = lead.friction_clusters[0];
  const category = primaryCluster?.category || 'intake';
  
  // Map categories to efficiency metrics
  const efficiencyMap = {
    intake: {
      manual: '15-20 min per order',
      digital: '2-3 min per order',
      benchmark: 'Industry Benchmarks: 80-90% time reduction'
    },
    booking: {
      manual: '5-8 min per reservation',
      digital: '30-60 sec per reservation',
      benchmark: 'Industry Benchmarks: 85-90% time reduction'
    },
    logistics: {
      manual: '10-15 min per order coordination',
      digital: '2-4 min per order coordination',
      benchmark: 'Industry Benchmarks: 75-85% time reduction'
    }
  };
  
  const metrics = efficiencyMap[category] || efficiencyMap.intake;
  
  return `**Efficiency Table (Time-on-Task Metrics)**

| Process Type | Time-on-Task | Industry Benchmarks |
|--------------|--------------|---------------------|
| Manual Process | ${metrics.manual} | ${metrics.benchmark} |
| Digital Solution | ${metrics.digital} | ${metrics.benchmark} |
| Efficiency Gain | 75-90% reduction | Standard for ${category} automation |`;
}

// Generate Markdown brief
function generateMarkdownBrief(lead) {
  const processedLead = applyRecencyWeights(lead);
  const pitchHook = generateStaffPitchHook(processedLead);
  const efficiencyTable = generateEfficiencyTable(processedLead);
  
  // Collect all customer quotes
  const allQuotes = processedLead.friction_clusters.flatMap(cluster => 
    cluster.sample_quotes.map(quote => `- "${quote}"`)
  );
  
  // Format friction details
  const frictionDetails = processedLead.friction_clusters.map(cluster => 
    `**${cluster.category.toUpperCase()}** (${cluster.recent_count} recent, ${cluster.count} total)`
  ).join('\n');
  
  return `# Handoff Brief: ${processedLead.business_name}

## HFI Score: ${processedLead.hfi_score}/100

**Friction Type:** ${processedLead.friction_type}
**Status:** ${processedLead.status}
**Discovered:** ${new Date(processedLead.discovered_at).toLocaleDateString()}

---

${pitchHook}

---

${efficiencyTable}

---

## Friction Details

${frictionDetails}

## Customer Quotes

${allQuotes.join('\n')}

---

*Generated by Bridge.it Handoff Engine v4.2*
*Date: ${new Date().toISOString()}*`;
}

// Generate PDF report
function generatePDFReport(lead) {
  const processedLead = applyRecencyWeights(lead);
  const doc = new jsPDF.jsPDF();
  
  // Industrial Professional colors
  const slate = '#1e293b';
  const navy = '#0f172a';
  const white = '#ffffff';
  
  let yPos = 20;
  const margin = 20;
  const pageWidth = doc.internal.pageSize.getWidth();
  const contentWidth = pageWidth - (margin * 2);
  
  // Set font (Inter-like, using Helvetica as fallback)
  doc.setFont('helvetica');
  
  // Header
  doc.setFillColor(30, 41, 59); // Slate
  doc.rect(0, 0, pageWidth, 40, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.text('Bridge.it Handoff Report', margin, 25);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`Generated: ${new Date().toISOString().split('T')[0]}`, margin, 35);
  
  // Reset text color
  doc.setTextColor(15, 23, 42); // Navy
  
  yPos = 50;
  
  // Business Name
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text(processedLead.business_name, margin, yPos);
  yPos += 10;
  
  // HFI Score Badge
  doc.setFillColor(30, 41, 59);
  doc.roundedRect(margin, yPos - 5, 60, 8, 2, 2, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(12);
  doc.text(`HFI Score: ${processedLead.hfi_score}/100`, margin + 5, yPos);
  doc.setTextColor(15, 23, 42);
  yPos += 15;
  
  // Friction Type
  doc.setFontSize(12);
  doc.setFont('helvetica', 'normal');
  doc.text(`Friction Type: ${processedLead.friction_type}`, margin, yPos);
  yPos += 8;
  doc.text(`Status: ${processedLead.status}`, margin, yPos);
  yPos += 15;
  
  // Staff Pitch Hook Section
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('Staff Pitch Hook', margin, yPos);
  yPos += 8;
  
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  const recent = processedLead.recency_data["0_30_days"] || 0;
  const supporting = processedLead.recency_data["31_90_days"] || 0;
  const pitchText = `${processedLead.business_name} is experiencing a ${recent}% spike in ${processedLead.friction_type.toLowerCase()} complaints in the last 30 days, with ${supporting} supporting issues from the previous 60 days.`;
  const pitchLines = doc.splitTextToSize(pitchText, contentWidth);
  doc.text(pitchLines, margin, yPos);
  yPos += pitchLines.length * 5 + 5;
  
  // Key Customer Voice
  doc.setFont('helvetica', 'bold');
  doc.text('Key Customer Voice:', margin, yPos);
  yPos += 6;
  doc.setFont('helvetica', 'italic');
  const primaryCluster = processedLead.friction_clusters[0];
  const topQuote = primaryCluster?.sample_quotes[0] || '';
  const quoteLines = doc.splitTextToSize(`"${topQuote}"`, contentWidth);
  doc.text(quoteLines, margin, yPos);
  yPos += quoteLines.length * 5 + 8;
  
  // Check if we need a new page
  if (yPos > 250) {
    doc.addPage();
    yPos = 20;
  }
  
  // Efficiency Table Section
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('Efficiency Table (Time-on-Task Metrics)', margin, yPos);
  yPos += 10;
  
  // Table header
  doc.setFillColor(241, 245, 249); // Light gray background
  doc.rect(margin, yPos - 5, contentWidth, 8, 'F');
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text('Process Type', margin + 2, yPos);
  doc.text('Time-on-Task', margin + 60, yPos);
  doc.text('Industry Benchmarks', margin + 120, yPos);
  yPos += 8;
  
  // Table rows
  doc.setFont('helvetica', 'normal');
  const category = primaryCluster?.category || 'intake';
  const efficiencyMap = {
    intake: {
      manual: '15-20 min per order',
      digital: '2-3 min per order',
      benchmark: '80-90% time reduction'
    },
    booking: {
      manual: '5-8 min per reservation',
      digital: '30-60 sec per reservation',
      benchmark: '85-90% time reduction'
    },
    logistics: {
      manual: '10-15 min per order',
      digital: '2-4 min per order',
      benchmark: '75-85% time reduction'
    }
  };
  const metrics = efficiencyMap[category] || efficiencyMap.intake;
  
  // Manual Process row
  doc.rect(margin, yPos - 5, contentWidth, 7, 'S');
  doc.text('Manual Process', margin + 2, yPos);
  doc.text(metrics.manual, margin + 60, yPos);
  doc.text(metrics.benchmark, margin + 120, yPos);
  yPos += 7;
  
  // Digital Solution row
  doc.rect(margin, yPos - 5, contentWidth, 7, 'S');
  doc.text('Digital Solution', margin + 2, yPos);
  doc.text(metrics.digital, margin + 60, yPos);
  doc.text(metrics.benchmark, margin + 120, yPos);
  yPos += 7;
  
  // Efficiency Gain row
  doc.setFillColor(241, 245, 249);
  doc.rect(margin, yPos - 5, contentWidth, 7, 'F');
  doc.rect(margin, yPos - 5, contentWidth, 7, 'S');
  doc.setFont('helvetica', 'bold');
  doc.text('Efficiency Gain', margin + 2, yPos);
  doc.text('75-90% reduction', margin + 60, yPos);
  doc.text(`Standard for ${category}`, margin + 120, yPos);
  yPos += 15;
  
  // Check if we need a new page
  if (yPos > 250) {
    doc.addPage();
    yPos = 20;
  }
  
  // Friction Details Section
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('Friction Details', margin, yPos);
  yPos += 10;
  
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  processedLead.friction_clusters.forEach(cluster => {
    doc.setFont('helvetica', 'bold');
    doc.text(`${cluster.category.toUpperCase()}:`, margin, yPos);
    yPos += 6;
    doc.setFont('helvetica', 'normal');
    doc.text(`${cluster.recent_count} recent issues, ${cluster.count} total`, margin + 5, yPos);
    yPos += 8;
  });
  
  yPos += 5;
  
  // Check if we need a new page
  if (yPos > 250) {
    doc.addPage();
    yPos = 20;
  }
  
  // Customer Quotes Section
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('Customer Quotes', margin, yPos);
  yPos += 10;
  
  doc.setFontSize(9);
  doc.setFont('helvetica', 'italic');
  const allQuotes = processedLead.friction_clusters.flatMap(cluster => cluster.sample_quotes);
  allQuotes.slice(0, 5).forEach(quote => {
    const quoteLines = doc.splitTextToSize(`"${quote}"`, contentWidth);
    doc.text(quoteLines, margin + 5, yPos);
    yPos += quoteLines.length * 4 + 5;
    
    if (yPos > 270) {
      doc.addPage();
      yPos = 20;
    }
  });
  
  return doc;
}

// Helper function to load lead by ID
async function loadLeadById(leadId) {
  const mockDataPath = join(__dirname, '..', '_architect_ref', 'MOCK_DATA.json');
  const rawData = await readFile(mockDataPath, 'utf-8');
  const data = JSON.parse(rawData);
  return data.leads.find(l => l.id === leadId);
}

// Generate Handoff Route - Returns JSON with both files
app.post('/generate-handoff', async (req, res) => {
  try {
    const { leadId } = req.body;
    
    if (!leadId) {
      return res.status(400).json({ error: 'Lead ID is required' });
    }
    
    const lead = await loadLeadById(leadId);
    
    if (!lead) {
      return res.status(404).json({ error: 'Lead not found' });
    }
    
    // Generate markdown brief
    const markdownBrief = generateMarkdownBrief(lead);
    
    // Generate PDF report
    const pdfDoc = generatePDFReport(lead);
    const pdfBuffer = Buffer.from(pdfDoc.output('arraybuffer'));
    
    const filename = `${lead.business_name.replace(/\s+/g, '_')}_handoff_${new Date().toISOString().split('T')[0]}`;
    
    // Set response headers for both files
    res.setHeader('Content-Type', 'application/json');
    res.json({
      markdown: markdownBrief,
      pdf: pdfBuffer.toString('base64'),
      filename: filename
    });
    
  } catch (error) {
    console.error('Error generating handoff:', error);
    res.status(500).json({ 
      error: 'Failed to generate handoff',
      message: error.message 
    });
  }
});

// Download Markdown Brief
app.get('/generate-handoff/:leadId/markdown', async (req, res) => {
  try {
    const { leadId } = req.params;
    const lead = await loadLeadById(leadId);
    
    if (!lead) {
      return res.status(404).json({ error: 'Lead not found' });
    }
    
    const markdownBrief = generateMarkdownBrief(lead);
    const filename = `${lead.business_name.replace(/\s+/g, '_')}_handoff_${new Date().toISOString().split('T')[0]}.md`;
    
    res.setHeader('Content-Type', 'text/markdown');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(markdownBrief);
    
  } catch (error) {
    console.error('Error generating markdown:', error);
    res.status(500).json({ 
      error: 'Failed to generate markdown',
      message: error.message 
    });
  }
});

// Download PDF Report
app.get('/generate-handoff/:leadId/pdf', async (req, res) => {
  try {
    const { leadId } = req.params;
    const lead = await loadLeadById(leadId);
    
    if (!lead) {
      return res.status(404).json({ error: 'Lead not found' });
    }
    
    const pdfDoc = generatePDFReport(lead);
    const filename = `${lead.business_name.replace(/\s+/g, '_')}_handoff_${new Date().toISOString().split('T')[0]}.pdf`;
    
    const pdfBuffer = Buffer.from(pdfDoc.output('arraybuffer'));
    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(pdfBuffer);
    
  } catch (error) {
    console.error('Error generating PDF:', error);
    res.status(500).json({ 
      error: 'Failed to generate PDF',
      message: error.message 
    });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    version: '4.2.0',
    vertical: 'Hospitality',
    timestamp: new Date().toISOString()
  });
});

app.listen(PORT, () => {
  console.log(`🚀 Bridge.it API Server v4.2 running on http://localhost:${PORT}`);
  console.log(`📊 Endpoints:`);
  console.log(`   GET /api/leads                    - Fetch all restaurant leads`);
  console.log(`   GET /api/leads/:id                - Fetch single lead by ID`);
  console.log(`   POST /generate-handoff             - Generate handoff brief (JSON)`);
  console.log(`   GET /generate-handoff/:leadId/markdown - Download markdown brief`);
  console.log(`   GET /generate-handoff/:leadId/pdf      - Download PDF report`);
  console.log(`   GET /health                       - Health check`);
  console.log(`\n🎯 Ready for Feb 9th demo!`);
});
