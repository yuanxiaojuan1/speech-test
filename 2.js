const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));
app.use(express.static(path.join(__dirname, "public")));

const DATA_FILE = path.join(__dirname, "data.json");

/* ---------- 读写数据 ---------- */
function readData() {
  if (!fs.existsSync(DATA_FILE)) return [];
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, "utf-8"));
  } catch { return []; }
}
function writeData(arr) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(arr, null, 2), "utf-8");
}

/* ---------- 提交一次测评 ---------- */
// body: { student: "张三", results: [ {question, spoken, overall, accuracy, fluency, completeness, errors:[{target,heard,type}]} ] }
app.post("/api/submit", (req, res) => {
  const { student, results } = req.body || {};
  if (!student || !Array.isArray(results)) {
    return res.status(400).json({ ok: false, msg: "参数不完整" });
  }
  const all = readData();
  all.push({
    student: String(student).trim(),
    time: new Date().toISOString(),
    results
  });
  writeData(all);
  res.json({ ok: true, count: all.length });
});

/* ---------- 班级错误率报表 ---------- */
app.get("/api/report", (req, res) => {
  const all = readData();
  if (!all.length) {
    return res.json({ ok: true, empty: true });
  }

  // 每个学生一次提交，可能多次提交取最新
  const latest = {};
  all.forEach(r => { latest[r.student] = r; });
  const records = Object.values(latest);

  const studentCount = records.length;

  // 题目维度统计
  const qMap = {};   // question -> {total, sumScore, errors:{}}
  // 错误词维度统计
  const errMap = {}; // word -> count

  records.forEach(rec => {
    rec.results.forEach(r => {
      const q = r.question;
      if (!qMap[q]) qMap[q] = { total: 0, sumScore: 0, sumAcc: 0, errors: {} };
      qMap[q].total++;
      qMap[q].sumScore += r.overall || 0;
      qMap[q].sumAcc   += r.accuracy || 0;

      (r.errors || []).forEach(e => {
        // 单词级错误：只统计单词题
        const key = e.target;
        errMap[key] = (errMap[key] || 0) + 1;
        if (qMap[q].errors[key]) qMap[q].errors[key]++;
        else qMap[q].errors[key] = 1;
      });
    });
  });

  // 整理题目报表
  const questionReport = Object.entries(qMap).map(([q, v]) => ({
    question: q,
    studentCount: v.total,
    avgScore: Math.round(v.sumScore / v.total),
    avgAccuracy: Math.round(v.sumAcc / v.total),
    topErrors: Object.entries(v.errors)
      .sort((a,b)=>b[1]-a[1]).slice(0,5)
      .map(([w,c]) => ({ word: w, count: c,
        rate: Math.round(c / v.total * 100) }))
  })).sort((a,b)=>a.avgScore - b.avgScore); // 低分排前面

  // 全班错误词排行
  const errorRank = Object.entries(errMap)
    .map(([word, count]) => ({
      word, count,
      rate: Math.round(count / studentCount * 100)
    }))
    .sort((a,b)=>b.count - a.count);

  res.json({
    ok: true,
    studentCount,
    submitCount: all.length,
    questionReport,
    errorRank
  });
});

/* ---------- 清空数据（可选，加个口令） ---------- */
app.post("/api/clear", (req, res) => {
  if (req.body.password !== "teacher123") {
    return res.status(403).json({ ok: false });
  }
  writeData([]);
  res.json({ ok: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ 服务已启动: http://localhost:${PORT}`);
});