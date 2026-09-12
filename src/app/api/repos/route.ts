import { NextResponse } from "next/server";
import { getReposFromDB } from "@/lib/db";

export async function GET() {
  return NextResponse.json({ repos: getReposFromDB() });
}
