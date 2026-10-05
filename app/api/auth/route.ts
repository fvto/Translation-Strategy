import { NextRequest, NextResponse } from "next/server";
import { db } from "@/services/database/db";
import { createSessionToken, verifySessionToken } from "@/services/security/auth";

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json();

    if (!email || !password) {
      return NextResponse.json({ error: "Email and password are required" }, { status: 400 });
    }

    const user = db.getUserByEmail(email);
    if (!user || !db.verifyPassword(user, password)) {
      db.addAuditLog({
        userId: "anonymous",
        userEmail: email,
        operation: "LOGIN_FAILED",
        status: "FAILURE",
        durationMs: 12,
        errorCode: "INVALID_CREDENTIALS",
      });
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    const token = createSessionToken(user);

    db.addAuditLog({
      userId: user.id,
      userEmail: user.email,
      operation: "LOGIN_SUCCESS",
      status: "SUCCESS",
      durationMs: 10,
    });

    const response = NextResponse.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
      token,
    });

    response.cookies.set({
      name: "secure_session",
      value: token,
      httpOnly: true,
      sameSite: "strict",
      path: "/",
      maxAge: 24 * 60 * 60,
    });

    return response;
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Internal server error" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const token =
    req.cookies.get("secure_session")?.value ||
    req.headers.get("authorization")?.replace("Bearer ", "");

  if (!token) {
    return NextResponse.json({ user: null }, { status: 200 });
  }

  const session = verifySessionToken(token);
  return NextResponse.json({ user: session }, { status: 200 });
}

export async function DELETE() {
  const response = NextResponse.json({ success: true });
  response.cookies.set({
    name: "secure_session",
    value: "",
    httpOnly: true,
    sameSite: "strict",
    path: "/",
    maxAge: 0,
  });
  return response;
}
