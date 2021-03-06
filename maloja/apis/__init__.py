from . import native_v1
from .audioscrobbler import Audioscrobbler
from .listenbrainz import Listenbrainz

import copy
from bottle import redirect, request
from urllib.parse import urlencode

native_apis = [
	native_v1.api
]
standardized_apis = [
	Listenbrainz(),
	Audioscrobbler()
]

def init_apis(server):
	for api in native_apis:
		api.mount(server=server,path="apis/"+api.__apipath__)

	for api in standardized_apis:
		aliases = api.__aliases__
		canonical = aliases[0]
		api.nimrodelapi.mount(server=server,path="apis/" + canonical)

		# redirects
		for alias in aliases[1:]:
			altpath = "/apis/" + alias + "/<pth:path>"
			altpath_empty = "/apis/" + alias
			altpath_empty_cl = "/apis/" + alias + "/"

			def alias_api(pth=""):
				redirect("/apis/" + canonical + "/" + pth + "?" + urlencode(request.query))

			server.get(altpath)(alias_api)
			server.post(altpath)(alias_api)
			server.get(altpath_empty)(alias_api)
			server.post(altpath_empty)(alias_api)
			server.get(altpath_empty_cl)(alias_api)
			server.post(altpath_empty_cl)(alias_api)
