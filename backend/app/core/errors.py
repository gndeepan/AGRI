from fastapi import HTTPException


class AppError(HTTPException):
    def __init__(self, status_code: int, detail: str, code: str | None = None):
        super().__init__(status_code=status_code, detail=detail)
        self.code = code


def not_found(what: str = "Resource") -> AppError:
    return AppError(404, f"{what} not found", "not_found")
