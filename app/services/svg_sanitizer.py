"""Strict, dependency-free sanitization for uploaded SVG images.

SVG is an XML document and may contain script, event handlers, navigation,
external resource loads, or embedded HTML.  Uploaded brand assets are public,
so they must be reduced to a static-image subset before being persisted.
"""

from __future__ import annotations

import base64
import binascii
import re
import xml.etree.ElementTree as ET


class UnsafeSvgError(ValueError):
    """Raised when an SVG is malformed or outside the supported safe subset."""


_SVG_NAMESPACE = "http://www.w3.org/2000/svg"
_XLINK_NAMESPACE = "http://www.w3.org/1999/xlink"
_XML_NAMESPACE = "http://www.w3.org/XML/1998/namespace"

# A static-image subset.  In particular, scripting, embedded HTML, navigation,
# SMIL animation and elements capable of fetching arbitrary resources are not
# present in this allowlist.
_ALLOWED_ELEMENTS = {
    "svg",
    "g",
    "defs",
    "symbol",
    "use",
    "switch",
    "path",
    "rect",
    "circle",
    "ellipse",
    "line",
    "polyline",
    "polygon",
    "text",
    "tspan",
    "textpath",
    "title",
    "desc",
    "metadata",
    "style",
    "image",
    "lineargradient",
    "radialgradient",
    "stop",
    "pattern",
    "clippath",
    "mask",
    "marker",
    "filter",
    "fegaussianblur",
    "fecolormatrix",
    "feoffset",
    "feblend",
    "fecomposite",
    "feflood",
    "femerge",
    "femergenode",
    "femorphology",
    "feturbulence",
    "fedisplacementmap",
    "fedropshadow",
    "fecomponenttransfer",
    "fefuncr",
    "fefuncg",
    "fefuncb",
    "fefunca",
    "feconvolvematrix",
    "fediffuselighting",
    "fespecularlighting",
    "fedistantlight",
    "fepointlight",
    "fespotlight",
    "fetile",
}

_LOCAL_REFERENCE_ELEMENTS = {"use", "textpath"}
_URL_ATTRIBUTE_NAMES = {
    "base",
    "href",
    "src",
    "data",
    "poster",
    "action",
    "formaction",
    "cursor",
}
_STYLE_ATTRIBUTE_NAMES = {"style"}
_MAX_ELEMENTS = 10_000
_MAX_DEPTH = 64
_MAX_ATTRIBUTES_PER_ELEMENT = 128
_MAX_ATTRIBUTE_VALUE_LENGTH = 1_000_000
_MAX_EMBEDDED_IMAGE_BYTES = 1_000_000

_LOCAL_FRAGMENT_RE = re.compile(r"^#[A-Za-z0-9_.:-]+$")
_URL_FUNCTION_RE = re.compile(
    r"url\s*\(\s*(['\"]?)(.*?)\1\s*\)", re.IGNORECASE | re.DOTALL
)
_EMBEDDED_IMAGE_RE = re.compile(
    r"^data:image/(png|jpeg|webp);base64,([A-Za-z0-9+/=\s]+)$",
    re.IGNORECASE,
)


def _qualified_name(name: str) -> tuple[str, str]:
    if name.startswith("{") and "}" in name:
        namespace, local_name = name[1:].split("}", 1)
        return namespace, local_name
    return "", name


def _is_safe_embedded_bitmap(value: str) -> bool:
    match = _EMBEDDED_IMAGE_RE.fullmatch(value.strip())
    if match is None:
        return False
    kind = match.group(1).lower()
    try:
        payload = base64.b64decode(
            re.sub(r"\s+", "", match.group(2)), validate=True
        )
    except (binascii.Error, ValueError):
        return False
    if not payload or len(payload) > _MAX_EMBEDDED_IMAGE_BYTES:
        return False
    if kind == "png":
        return payload.startswith(b"\x89PNG\r\n\x1a\n")
    if kind == "jpeg":
        return payload.startswith(b"\xff\xd8\xff")
    return (
        len(payload) >= 12
        and payload.startswith(b"RIFF")
        and payload[8:12] == b"WEBP"
    )


def _validate_css(value: str) -> None:
    lowered = value.lower()
    compact = re.sub(r"[\x00-\x20]+", "", lowered)
    if (
        "\\" in value
        or "/*" in value
        or "@" in value
        or "expression(" in compact
        or "javascript:" in compact
        or "vbscript:" in compact
        or "-moz-binding" in compact
        or "behavior:" in compact
    ):
        raise UnsafeSvgError("Unsafe CSS in SVG")

    matches = list(_URL_FUNCTION_RE.finditer(value))
    for match in matches:
        if _LOCAL_FRAGMENT_RE.fullmatch(match.group(2).strip()) is None:
            raise UnsafeSvgError("External CSS URL in SVG")

    # Reject malformed/obfuscated URL functions that the conservative parser
    # above did not consume.
    without_local_urls = _URL_FUNCTION_RE.sub("", lowered)
    if "url" in without_local_urls:
        raise UnsafeSvgError("Malformed CSS URL in SVG")


def _validate_tree_complexity(root: ET.Element) -> None:
    count = 0
    stack: list[tuple[ET.Element, int]] = [(root, 1)]
    while stack:
        element, depth = stack.pop()
        count += 1
        if count > _MAX_ELEMENTS or depth > _MAX_DEPTH:
            raise UnsafeSvgError("SVG is too complex")
        if len(element.attrib) > _MAX_ATTRIBUTES_PER_ELEMENT:
            raise UnsafeSvgError("SVG element has too many attributes")
        stack.extend((child, depth + 1) for child in list(element))


def _validate_element(element: ET.Element) -> None:
    namespace, local_name = _qualified_name(element.tag)
    local_name_lower = local_name.lower()
    if namespace not in {"", _SVG_NAMESPACE}:
        raise UnsafeSvgError("Foreign XML namespace in SVG")
    if local_name_lower not in _ALLOWED_ELEMENTS:
        raise UnsafeSvgError("Unsupported SVG element")

    if local_name_lower == "style":
        _validate_css(element.text or "")

    href_values: list[str] = []
    for raw_name, raw_value in element.attrib.items():
        attr_namespace, attr_name = _qualified_name(raw_name)
        attr_name_lower = attr_name.lower()
        value = str(raw_value)

        if attr_namespace not in {"", _XLINK_NAMESPACE, _XML_NAMESPACE}:
            raise UnsafeSvgError("Foreign attribute namespace in SVG")
        if attr_namespace == _XLINK_NAMESPACE and attr_name_lower != "href":
            raise UnsafeSvgError("Unsupported XLink attribute in SVG")
        if len(value) > _MAX_ATTRIBUTE_VALUE_LENGTH:
            raise UnsafeSvgError("SVG attribute is too large")
        if attr_name_lower.startswith("on") or "script" in attr_name_lower:
            raise UnsafeSvgError("Event/script attribute in SVG")

        compact = re.sub(r"[\x00-\x20]+", "", value).lower()
        if "javascript:" in compact or "vbscript:" in compact:
            raise UnsafeSvgError("Script URL in SVG")

        if attr_name_lower in _STYLE_ATTRIBUTE_NAMES:
            _validate_css(value)
        elif "url" in value.lower():
            # Presentation attributes such as fill/filter may use local defs,
            # but never network or data URLs.
            _validate_css(value)

        if attr_name_lower in _URL_ATTRIBUTE_NAMES:
            if attr_name_lower != "href":
                raise UnsafeSvgError("Unsupported URL attribute in SVG")
            href_values.append(value.strip())

    for href_value in href_values:
        if local_name_lower in _LOCAL_REFERENCE_ELEMENTS:
            if _LOCAL_FRAGMENT_RE.fullmatch(href_value) is None:
                raise UnsafeSvgError("External SVG reference")
        elif local_name_lower == "image":
            if not _is_safe_embedded_bitmap(href_value):
                raise UnsafeSvgError("External or unsafe embedded SVG image")
        else:
            raise UnsafeSvgError("Navigation/reference is not allowed in SVG")


def sanitize_svg_bytes(raw: bytes) -> bytes:
    """Return a canonical, static-only SVG or raise :class:`UnsafeSvgError`."""

    if not raw or b"\x00" in raw:
        raise UnsafeSvgError("Empty or binary SVG")
    lowered = raw.lower()
    if b"<!doctype" in lowered or b"<!entity" in lowered:
        raise UnsafeSvgError("DTD/entities are not allowed in SVG")
    if b"<?xml-stylesheet" in lowered:
        raise UnsafeSvgError("External XML stylesheets are not allowed in SVG")

    try:
        root = ET.fromstring(raw)
    except (ET.ParseError, ValueError, UnicodeError) as exc:
        raise UnsafeSvgError("Malformed SVG") from exc

    root_namespace, root_name = _qualified_name(root.tag)
    if root_namespace not in {"", _SVG_NAMESPACE} or root_name.lower() != "svg":
        raise UnsafeSvgError("SVG root element is required")

    _validate_tree_complexity(root)
    for element in root.iter():
        _validate_element(element)

    ET.register_namespace("", _SVG_NAMESPACE)
    ET.register_namespace("xlink", _XLINK_NAMESPACE)
    return ET.tostring(
        root,
        encoding="utf-8",
        xml_declaration=True,
        short_empty_elements=True,
    )
