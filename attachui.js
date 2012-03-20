// One method would've been to hook into Wedge's attach functions, but since there are quite a lot of fundamental differences
// between the workings, I decided to write my own instead
$(function()
{
	// No point in this if we cannot support XHR upload
	if (typeof(File) == 'undefined' || typeof((new XMLHttpRequest).upload) == 'undefined')
		return true;

	var $element = $('#attachments_container > input[type=file]:first'),
		$files = [],
		$current = -1,
		$is_uploading = false,
		xhr = null;

	// Release this input of the default chains, we got new ones!
	$element.unbind('change');

	// Update this element to support multiple attachments
	$element.attr('name', 'attachment_holder')
		 .attr('multiple', 'multiple')
	// Bind the "change" event to properly handle multiple attachments into upload
		.change(function()
		{
			var files = this.files;

			return attachFiles(files, 0);
		});

	document.getElementById('main').ondragover = function(e)
	{
		var effect = e.dataTransfer.effectAllowed;
		if (effect == 'move' || effect == 'linkMove')
			e.dataTransfer.dropEffect = 'move';
		else
			e.dataTransfer.dropEffect = 'copy';
		e.stopPropagation();
		e.preventDefault();
	};
	document.getElementById('main').ondrop = function(event)
	{
		// Make sure we are dragging a file over
		if (!event.dataTransfer && !(dt.files || (!$.browser.webkit && event.dataTransfer.types.contains && event.dataTransfer.types.contains('Files'))))
			return false;
		
		var files = event.dataTransfer.files;
		return attachFiles(files, 0);
	};

	var startUpload = function()
	{
		if ($is_uploading )
			return true;
		
		// Are we done?
		if (typeof($files[++$current]) == 'undefined')
		{
			$current--;
			return true;
		}

		$is_uploading = true;
		var $timer = (new Date).getTime();
		var $progress = $('<div class="windowbg2" style="height: 16px; width:150px; float: right; border: 1px solid black;"><div class="plainbox" style="background: #E2F3EA; height:12px; padding: 0; border-radius: 0; border: 0; width: 0px;"></div></div>')
						.prependTo($files[$current].element);

		xhr = new XMLHttpRequest();
		self.current_xhr = xhr;
		xhr.open('POST', we_prepareScriptUrl() + 'action=multiattach;filename=' + $files[$current].fileName + ';board=' + curr_board, true);
		xhr.setRequestHeader("X-Requested-With", "XMLHttpRequest");
		xhr.setRequestHeader("X-File-Name", encodeURIComponent($files[$current].fileName));
		xhr.setRequestHeader("Content-Type", "application/octet-stream");
		xhr.upload.progress = function(e)
		{
			if (e.lengthComputable && (new Date).getTime() - $timer > 500)
			{
				$timer = Date.getTime();
				$progress.find('.plainbox').width((e.loaded / e.total) * 150);
			}
		};
		xhr.onreadystatechange = function(e)
		{
			if (xhr.readyState == 4 && xhr.status == 200)
			{
				var $response = $.parseJSON(xhr.responseText);
				$is_uploading = false;
				$progress.remove();
				
				$files[$current].element.find('.delete').remove();
				if ($response.valid)
				{
					$files[$current].element.find('span').css('font-style', 'normal');
					$files[$current].element.prepend($('<input type="button" class="submit" style="margin-top: 4px" />'));
				}
				else
				{
					var $name = $files[$current].element.find('span');
					$name.css('color', 'red');
				}

				// Move onto the next file
				startUpload();
			}
		};

		xhr.send($files[$current]);
	};

	var attachFiles = function(files, i)
	{
		if (typeof(files[i]) == 'undefined')
			return true;
				
		var $container = $('<div></div>').css('max-width', '500px');
		$('<input type="button" class="delete" style="margin-top: 4px" />')
			.click(function()
			{
				var i = $(this).data('file');

				$(this).parent().remove();

				// Shift consecutive file element's index
				for (var n = i + 1; n < files.length; n++)
				{
					var file = $files[n];
					delete $files[n];
					$files[n - 1] = file;
				}

				// This the one being uploaded?
				if (i == $current && $is_uploading)
				{
					xhr.abort();
					$current--;
					startUpload();
				}
			})
			.appendTo($container);
		$('<span style="margin-left: 5px; font-style: italic;"></span>')
			.text(files[i].fileName)
			.appendTo($container);
		
		$container.appendTo($element.parent());
		$files[$files.length] = files[i];
		$files[$files.length - 1].element = $container;
		$container.data('file', $files.length - 1);

		// Always start upload automatically, it'll automatically skip if in progress
		startUpload();

		return attachFiles(files, ++i);
	};
});