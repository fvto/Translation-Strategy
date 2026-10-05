import { NextRequest, NextResponse } from "next/server";
import { db } from "@/services/database/db";

export async function GET() {
  const docs = db.getDocuments();
  return NextResponse.json({ documents: docs });
}
