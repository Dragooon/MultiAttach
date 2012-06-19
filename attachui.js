/**
 * Multiple attachment basic javascipt file, contains the entire UI functions
 *
 * @package Dragooon:MultiAttach
 * @author Shitiz "Dragooon" Garg <Email mail@dragooon.net> <Url http://smf-media.com>
 * @copyright 2012, Shitiz "Dragooon" Garg <mail@dragooon.net>
 * @license
 *		Licensed under "New BSD License (3-clause version)"
 *		http://www.opensource.org/licenses/BSD-3-Clause
 *
 * @version 1.0
 */

// One method would've been to hook into Wedge's attach functions, but since there are quite a lot of fundamental differences
// between the workings, I decided to write my own instead.
$(function (undefined)
{
	// No point in this if we cannot support XHR upload
	if (File === undefined || (new XMLHttpRequest).upload === undefined)
		return true;

	var
		$element = $('#attachments_container > input[type=file]:first'),
		$files = [],
		$current = -1,
		$is_uploading = false,
		total_size = 0,
		xhr = null;

	$element
		// Release this input of the default chains, we got new ones!
		.unbind('change')
		// Update this element to support multiple attachments
		.attr('name', 'attachment_holder')
		.attr('multiple', true)
		// Bind the "change" event to properly handle multiple attachments into upload
		.change(function () { if (this.files) return attachFiles(this.files, 0); });

	$('<div id="dropnotice" style="text-align: center; border: 1px solid black; padding: 20px;" class="windowbg2"><div class="largetext">' + txt_drag_help + '</div><div class="mediumtext">' + txt_drag_help_subtext  + '</div></div>')
		.hide()
		.prependTo($element.parent());

	var dragUIOpened = false, dragTimer = +new Date();
	$.event.props.push('dataTransfer');

	$(document.body)
		.bind('dragover', function (e)
		{
			e.dataTransfer.dropEffect = 'none';

			e.stopPropagation();
			e.preventDefault();

			// Expand the additional option if it's collapsed
			if (!dragUIOpened)
			{
				if (!$('#postAttachment2').is(':visible'))
					$('#postMoreExpandLink').data('that').toggle();

				// Show a neat "Drop the file here" notice
				$element.fadeOut('fast', function () { $('#dropnotice').fadeIn(); });
				dragUIOpened = true;
			}
			dragTimer = +new Date();
		})
		.bind('dragleave', function ()
		{
			setTimeout(function ()
			{
				if ((+new Date()) - dragTimer > 200)
				{
					$('#dropnotice').fadeOut('fast', function () { $element.fadeIn(); });
					dragUIOpened = false;
				}
			}, 200);
		});

	$('#dropnotice')
		.bind('dragover', function (e)
		{
			dragTimer = +new Date();
			e.dataTransfer.dropEffect = 'copy';

			e.stopPropagation();
			e.preventDefault();
		})
		.bind('drop', function (e)
		{
			// Make sure we are dragging a file over
			if (!e.dataTransfer && !(dt.files || (!$.browser.webkit && e.dataTransfer.types.contains && e.dataTransfer.types.contains('Files'))))
				return false;

			dragUIOpened = false;

			var files = e.dataTransfer.files;
			$('#dropnotice').fadeOut('fast', function ()
			{
				$element.fadeIn(function () { attachFiles(files, 0); });
			});
		});

	var startUpload = function ()
	{
		if ($is_uploading)
			return true;

		// Are we done?
		if ($files[++$current] === undefined)
		{
			$current--;
			return true;
		}

		$is_uploading = true;
		var
			$timer = +new Date(),
			$progress = $('<div class="windowbg2" style="height: 16px; width: 150px; float: right; border: 1px solid black"><div class="plainbox" style="background: #e2f3ea; height: 12px; padding: 0; border-radius: 0; border: 0; width: 0"></div></div>')
				.prependTo($files[$current].element);

		xhr = new XMLHttpRequest();
		xhr.open('POST', weUrl() + 'action=multiattach;filename=' + ($files[$current].fileName || $files[$current].name) + ';board=' + curr_board, true);
		xhr.setRequestHeader("X-Requested-With", "XMLHttpRequest");
		xhr.setRequestHeader("X-File-Name", encodeURIComponent($files[$current].fileName || $files[$current].name));
		xhr.setRequestHeader("Content-Type", "application/octet-stream");
		xhr.upload.onprogress = function (e)
		{
			if (e.lengthComputable && (+new Date()) - $timer > 500)
			{
				$timer = +new Date();
				// console.log(e.loaded / e.total);
				$progress.find('.plainbox').width((e.loaded / e.total) * 150);
			}
		};
		xhr.onreadystatechange = function (e)
		{
			if (xhr.readyState == 4 && xhr.status == 200)
			{
				var $response = $.parseJSON(xhr.responseText);
				$is_uploading = false;
				$progress.remove();

				$files[$current].element.find('.delete').remove();
				if ($response.valid)
					$files[$current].element
						.find('span').css('font-style', 'normal').end()
						.prepend($('<input type="button" class="submit" style="margin-top: 4px" />'));
				else
					$files[$current].element.find('span').css('color', 'red');

				// Move onto the next file
				startUpload();
			}
		};

		xhr.send($files[$current]);
	},

	attachFiles = function (files, i)
	{
		if (files[i] === undefined)
			return true;

		// Check for file's extension
		var
			filename = files[i].fileName || files[i].name,
			filesize = files[i].fileSize || files[i].size,
			extension = filename.substr(filename.lastIndexOf('.') + 1, filename.length).toLowerCase();

		if (attachOpts.checkExtension && !in_array(extension, attachOpts.validExtensions))
		{
			alert(attachOpts.ext_error.replace('{ext}', extension));
			return attachFiles(files, ++i);
		}

		// Check number of files
		if (attachOpts.maxNum > 0 && attachOpts.currentNum + $files.length > attachOpts.maxNum)
		{
			alert(attachOpts.maxNum_error);
			return;
		}

		// Check for file's size
		if (attachOpts.sizeLimit > 0 && filesize / 1024 > attachOpts.sizeLimit)
		{
			alert(attachOpts.filesize_error);
			return attachFiles(files, ++i);
		}

		// Check total file's size
		if (attachOpts.totalSizeLimit > 0 && (filesize / 1024 + attachOpts.totalSize + total_size) > attachOpts.totalSizeLimit)
		{
			alert(attachOpts.totalFilesize_error);
			return;
		}

		var $container = $('<div></div>').css('max-width', '500px');
		$('<input type="button" class="delete" style="margin-top: 4px" />')
			.click(function ()
			{
				var i = $(this).data('file'), n = i + 1, len = files.length;

				$(this).parent().remove();

				// Shift consecutive file element's index
				for (; n < len; n++)
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

		$('<span style="margin-left: 5px; font-style: italic"></span>')
			.text(files[i].fileName || files[i].name)
			.appendTo($container);

		$container.appendTo($element.parent());
		$files[$files.length] = files[i];
		$files[$files.length - 1].element = $container;
		$container.data('file', $files.length - 1);
		total_size += filesize / 1024;

		// Always start upload automatically, it'll automatically skip if in progress
		startUpload();

		return attachFiles(files, ++i);
	};
});
