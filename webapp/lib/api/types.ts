export interface ApiError {
    message: string;
    statusCode?: number;
    code?: string;
    data?: unknown;
}
