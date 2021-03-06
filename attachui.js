/**
 * Multiple attachment basic JavaScript file, contains the entire UI functions
 *
 * @package Wedgward:MassAttach
 * @author Shitiz "Dragooon" Garg <Email mail@dragooon.net> <Url http://smf-media.com> (and Nao)
 * @copyright 2012, Shitiz "Dragooon" Garg <mail@dragooon.net>
 * @license
 *		Licensed under "New BSD License (3-clause version)"
 *		http://www.opensource.org/licenses/BSD-3-Clause
 *
 * @version 1.0
 */

@language Wedgeward:MassAttach:plugin;

// One method would've been to hook into Wedge's attach functions, but since there are quite a lot of fundamental differences
// between the workings, I decided to write my own instead.
$(function (jQuery, undefined)
{
	// No point in this if we cannot support XHR level 2 upload
	if (!(window.ProgressEvent && window.FormData && $.support.cors))
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
		.off('change')
		// Update this element to support multiple attachments
		.attr('name', 'attachment_holder')
		// Bind the "change" event to properly handle multiple attachments into upload
		.change(function () { return attachFiles(this.files || {}, 0); });

	$('<div id="dropnotice" style="text-align: center; border: 1px solid black; padding: 20px" class="windowbg2"><div class="largetext">' + $txt['massattach_drag_help'] + '</div><div class="mediumtext">' + $txt['massattach_drag_help_subtext'] + '</div></div>')
		.hide()
		.prependTo($element.parent());

	var dragUIOpened = false, dragTimer = +new Date();

	$(document.body)
		.on('dragover', function (e)
		{
			// Make sure we are dragging a file over
			var dt = e.originalEvent.dataTransfer;
			if (dt.types == null || !(dt.types.indexOf ? dt.types.indexOf('Files') != -1 : dt.types.contains('application/x-moz-file')))
				return true;
			
			e.originalEvent.dataTransfer.dropEffect = 'none';

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

			return false;
		})
		.on('dragleave', function ()
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

	// Bind the form to prevent accidental submitting when uploading.
	$('#postmodify').on('submit', function (e)
	{
		if ($is_uploading)
		{
			say($txt['massattach_currently_uploading']);
			return false;
		}
	});

	$('#dropnotice')
		.on('dragover', function (e)
		{
			dragTimer = +new Date();
			e.originalEvent.dataTransfer.dropEffect = 'copy';

			return false;
		})
		.on('drop', function (e)
		{
			var dt = e.originalEvent.dataTransfer;

			// Make sure we are dropping a file over
			if (!dt || !(dt.files || (!is_webkit && dt.types.contains && dt.types.contains('Files'))))
				return false;

			dragUIOpened = false;

			var files = dt.files;
			$('#dropnotice').fadeOut('fast', function ()
			{
				$element.fadeIn(function () { attachFiles(files, 0); });
			});

			return false;
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
			$progress = $('<div class="windowbg2 inline-block middle" style="height: 16px; width: 150px; margin: 5px 10px; border: 1px solid #666"><div class="plainbox" style="background: #c2d3ca; height: 12px; padding: 0; border-radius: 0; border: 0; width: 0"></div></div>')
				.appendTo($files[$current].element);

		xhr = new XMLHttpRequest();
		xhr.open('POST', weUrl('action=massattach;board=' + we_board));
		xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
		xhr.setRequestHeader('X-File-Name', $files[$current].fileName || $files[$current].name);
		xhr.setRequestHeader('Content-Type', 'application/octet-stream');
		xhr.upload.onprogress = function (e)
		{
			if (e.lengthComputable && (+new Date()) - $timer > 500)
			{
				$timer = +new Date();
				$progress.find('.plainbox').width((e.loaded / e.total) * 150);
			}
		};
		xhr.onreadystatechange = function (e)
		{
			if (xhr.readyState == 4 && xhr.status == 200)
			{
				var $response = $.parseJSON(xhr.responseText);
				$progress.remove();

				// !! @todo: still needs to be able to handle removal requests...
				if ($response.valid)
				{
					$files[$current].element
						.find('.delete').val(we_delete).end()
						.find('span').css('font-style', '');
					$('input[name="attach_del\[\]"]').last().closest('dd').after('<dd class="smalltext"><label><input type="checkbox" id="attachment_' + $response.id + '" name="attach_del[]" value="' + $response.id + '" checked onclick="oAttach().checkActive();" /> ' + $response.name + '</label></dd>');
				}
				else
					$files[$current].element
						.find('.delete').remove().end()
						.find('span').css('color', 'red')
						.append('<br>' + $response.error);

				// Move onto the next file
				$is_uploading = false;
				startUpload();
			}
		};

		xhr.send($files[$current]);
	},

	attachFiles = function (files, i)
	{
		if (files[i] === undefined)
		{
			// Since we automatically take the files and upload them, the file input
			// should be empty so that we don't upload on POST
			$clone = $element.clone(true);
			$('<form></form>').append($clone)[0].reset();
			$element.before($clone).detach();
			$.cleanData($element);
			$element = $clone;

			return true;
		}

		// Check for file's extension
		var
			filename = files[i].fileName || files[i].name,
			filesize = files[i].fileSize || files[i].size,
			extension = filename.slice(filename.lastIndexOf('.') + 1).toLowerCase();

		if (attachOpts.checkExtension && !in_array(extension, attachOpts.validExtensions))
		{
			say(attachOpts.ext_error.replace('{ext}', extension));
			return attachFiles(files, ++i);
		}

		// Check number of files
		if (attachOpts.maxNum > 0 && attachOpts.currentNum + $files.length > attachOpts.maxNum)
		{
			say(attachOpts.maxNum_error);
			return;
		}

		// Check for file's size
		if (attachOpts.sizeLimit > 0 && filesize / 1024 > attachOpts.sizeLimit)
		{
			say(attachOpts.filesize_error);
			return attachFiles(files, ++i);
		}

		// Check total file's size
		if (attachOpts.totalSizeLimit > 0 && (filesize / 1024 + attachOpts.totalSize + total_size) > attachOpts.totalSizeLimit)
		{
			say(attachOpts.totalFilesize_error);
			return;
		}

		var $container = $('<div style="margin-top: 8px">');

		$('<input type="button" class="delete" style="margin-top: 4px">')
			.val(we_cancel)
			.click(function ()
			{
				var i = $(this).parent().data('id');

				$(this).parent().remove();

				$files.splice(i, 1);

				// Fix all the IDs to correctly match their array index
				for (j = 0; j < $files.length; j++)
					$files[j].element.data('id', j);

				// This the one being uploaded?
				if (i == $current && $is_uploading)
				{
					xhr.abort();
					$is_uploading = false;
					$current--;
					startUpload();
				}
			})
			.appendTo($container);

		$('<span style="margin: 5px 10px; font-style: italic">')
			.text(files[i].fileName || files[i].name)
			.appendTo($container);

		if (/^image\//.test(files[i].type))
		{
			var imgPreview = new FileReader();

			if (imgPreview)
			{
				imgPreview.onload = function (e)
				{
					$('<img class="middle">')
						.appendTo($container)
						.load(function () {
							$(this)
								.height(Math.min($(this).height(), 50))
								.show();
						})
						.attr('src', e.target.result)
						.hide();
				};
				imgPreview.readAsDataURL(files[i]);
			}
		}

		$container.appendTo($element.parent());
		$files[$files.length] = files[i];
		$files[$files.length - 1].element = $container;
		$container.data('id', $files.length - 1);
		total_size += filesize / 1024;

		// Always start upload automatically, it'll automatically skip if in progress
		startUpload();

		return attachFiles(files, ++i);
	};
});
