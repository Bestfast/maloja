

chrome.tabs.onUpdated.addListener(onTabUpdated);
chrome.tabs.onRemoved.addListener(onTabRemoved);
//chrome.tabs.onActivated.addListener(onTabChanged);
chrome.runtime.onMessage.addListener(onPlaybackUpdate);

tabManagers = {}

pages = {
	"plex":{
		"patterns":[
			"https://app.plex.tv",
			"http://app.plex.tv",
			"https://plex.",
			"http://plex."
		],
		"script":"plex.js"
	},
	"youtube_music":{
		"patterns":[
			"https://music.youtube.com",
			"http://music.youtube.com"
		],
		"script":"ytmusic.js"
	}

}


function onTabUpdated(tabId, changeInfo, tab) {


	// still same page?
	//console.log("Update to tab " + tabId + "!")
	if (tabManagers.hasOwnProperty(tabId)) {
		//console.log("Yes!")
		page = tabManagers[tabId].page
		patterns = pages[page]["patterns"]
		//console.log("Page was managed by a " + page + " manager")
		for (var i=0;i<patterns.length;i++) {
			if (tab.url.startsWith(patterns[i])) {
				//console.log("Still on same page!")
				tabManagers[tabId].update()
				return
			}
		}
		console.log("Page on tab " + tabId + " changed, removing old " + page + " manager!")
		delete tabManagers[tabId]
	}

	//check if pattern matches
	for (var key in pages) {
		if (pages.hasOwnProperty(key)) {
			patterns = pages[key]["patterns"]
			for (var i=0;i<patterns.length;i++) {
				if (tab.url.startsWith(patterns[i])) {
					console.log("New page on tab " + tabId + " will be handled by new " + key + " manager!")
					tabManagers[tabId] = new Controller(tabId,key)
					return
					//chrome.tabs.executeScript(tab.id,{"file":"sitescripts/" + pages[key]["script"]})


				}
			}
		}

	}
}


function onTabRemoved(tabId,removeInfo) {

	console.log(tabId + " closed")
	if (tabManagers.hasOwnProperty(tabId)) {
		page = tabManagers[tabId].page
		console.log("this tab was " + page + ", now removing manager")
		tabManagers[tabId].stopPlayback("","") //in case we want to scrobble the playing track
		delete tabManagers[tabId]
	}

}




function onPlaybackUpdate(request,sender) {
	tabId = sender.tab.id
	//console.log("Message was sent from tab id " + tabId)
	if (tabManagers.hasOwnProperty(tabId)) {
		//console.log("This is managed! Seems to be " + tabManagers[tabId].page)
		tabManagers[tabId].playbackUpdate(request)

	}
	//console.log("Got update from Plex Web!")

}

class Controller {

	constructor(tabId,page) {
		this.tabId = tabId;
		this.page = page;

		this.currentTitle;
		this.currentArtist;
		this.currentLength;
		this.alreadyPlayed;
		this.currentlyPlaying = false;
		this.lastUpdate = 0;
		this.alreadyScrobbled = false;

		this.messageID = 0;

		this.update()
	}

	// the tab has been updated, we need to run the script
	update() {
		this.messageID++;
		//console.log("Update! Our page is " + this.page + ", our tab id " + this.tabId)
		chrome.tabs.executeScript(this.tabId,{"file":"sitescripts/" + pages[this.page]["script"]})
	}

	// an actual update message from the script has arrived
	playbackUpdate(request) {
		//console.log("Update message from our tab " + this.tabId + " (" + this.page + ")")
		if (request.type == "stopPlayback" && this.currentlyPlaying) {
			this.stopPlayback(request.artist,request.title);
		}
		else if (request.type == "startPlayback") {
			this.startPlayback(request.artist,request.title,request.duration);
		}
	}




	startPlayback(artist,title,seconds) {

		// CASE 1: Resuming playback of previously played title
		if (artist == this.currentArtist && title == this.currentTitle && !this.currentlyPlaying) {
			console.log("Resuming playback of " + this.currentTitle)

			// Already played full song
			while (this.alreadyPlayed > this.currentLength) {
				this.alreadyPlayed = this.alreadyPlayed - this.currentLength
				scrobble(this.currentArtist,this.currentTitle,this.currentLength)
			}

			this.setUpdate()
			this.currentlyPlaying = true

		}

		// CASE 2: New track is being played
		else if (artist != this.currentArtist || title != this.currentTitle) {

			//first inform ourselves that the previous track has now been stopped for good
			this.stopPlayback(artist,title)
			//then initialize new playback
			console.log("New track")
			this.setUpdate()
			this.alreadyPlayed = 0
			this.currentTitle = title
			this.currentArtist = artist
			this.currentLength = seconds
			console.log(artist + " - " + title + " is playing!")
			this.currentlyPlaying = true
		}
	}

	// the artist and title arguments are not attributes of the track being stopped, but of the track active now
	// they are here to recognize whether the playback has been paused or completely ended / replaced
	stopPlayback(artist,title) {

		//CASE 1: Playback just paused OR CASE 2: Playback ended
		if (this.currentlyPlaying) {
			var d = this.setUpdate()
			this.alreadyPlayed = this.alreadyPlayed + d
			console.log(d + " seconds played since last update, " + this.alreadyPlayed + " seconds played overall")
		}


		// Already played full song
		while (this.alreadyPlayed > this.currentLength) {
			this.alreadyPlayed = this.alreadyPlayed - this.currentLength
			scrobble(this.currentArtist,this.currentTitle,this.currentLength)
		}

		this.currentlyPlaying = false



		//ONLY CASE 2: Playback ended
		if (artist != this.currentArtist || title != this.currentTitle) {
			if (this.alreadyPlayed > this.currentLength / 2) {
				scrobble(this.currentArtist,this.currentTitle,this.alreadyPlayed)
				this.alreadyPlayed = 0
			}
		}
	}




	// sets last updated to now and returns how long since then
	setUpdate() {
		var d = new Date()
		var t = Math.floor(d.getTime()/1000)
		var delta = t - this.lastUpdate
		this.lastUpdate = t
		return delta
	}


}




function scrobble(artist,title,seconds) {
	console.log("Scrobbling " + artist + " - " + title + "; " + seconds + " seconds playtime")
	artiststring = encodeURIComponent(artist)
	titlestring = encodeURIComponent(title)
	chrome.storage.local.get("apikey",function(result) {
		APIKEY = result["apikey"]
		chrome.storage.local.get("serverurl",function(result) {
			URL = result["serverurl"]
			var xhttp = new XMLHttpRequest();
			xhttp.open("POST",URL + "/db/newscrobble",true);
			xhttp.send("artist=" + artiststring + "&title=" + titlestring + "&duration=" + seconds + "&key=" + APIKEY)
		});
	});


}
