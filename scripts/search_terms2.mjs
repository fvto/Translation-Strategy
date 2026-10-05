import XLSX from 'xlsx';

const wb = XLSX.readFile('Cuu-am-chan-kinh.xlsx');
for (const sheet of wb.SheetNames) {
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheet], { header: 1 });
  rows.forEach((r, idx) => {
    const s = JSON.stringify(r).toLowerCase();
    if (/lạng|cử|mài|bộ vị|đặt|vừa tới|trề|ngấn|cộm/i.test(s)) {
      console.log(`[${sheet} #${idx}] ${JSON.stringify(r)}`);
    }
  });
}
