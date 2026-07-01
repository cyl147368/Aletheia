import os

from fastapi.staticfiles import StaticFiles
from starlette.exceptions import HTTPException as StarletteHTTPException


class SPAStaticFiles(StaticFiles):
    async def get_response(self, path: str, scope):
        try:
            return await super().get_response(path, scope)
        except StarletteHTTPException as exc:
            has_file_extension = bool(os.path.splitext(path)[1])
            is_api_path = path == "api" or path.startswith("api/")
            if exc.status_code == 404 and scope["method"] in {"GET", "HEAD"} and not is_api_path and not has_file_extension:
                return await super().get_response("index.html", scope)
            raise
